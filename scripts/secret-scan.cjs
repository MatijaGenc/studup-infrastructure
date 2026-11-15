#!/usr/bin/env node
'use strict'

const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const RULES = [
    { id: 'github-pat-classic', re: /\bghp_[A-Za-z0-9]{36}\b/g },
    { id: 'github-pat-fine-grained', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g },
    { id: 'github-oauth', re: /\bgho_[A-Za-z0-9]{36}\b/g },
    { id: 'github-app-token', re: /\b(?:ghu|ghs)_[A-Za-z0-9]{36}\b/g },
    { id: 'aws-access-key-id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
    { id: 'aws-secret-access-key', re: /AWS_SECRET_ACCESS_KEY\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})/g },
    { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
    { id: 'slack-token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g },
    { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
    { id: 'openai-key', re: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g },
    { id: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
    { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
]

const IGNORED_PATHS = [
    /^node_modules\//,
    /^\.yarn\/cache\//,
    /^\.yarn\/releases\//,
    /^\.yarn\/plugins\//,
    /^build\//,
    /^dist\//,
    /^coverage\//,
    /^graphify-out\//,
    /^\.next\//,
    /^\.expo\//,
    /(^|\/)audit-results/,
    /(^|\/)[^/]+\.lock$/,
    /^pnpm-lock\.yaml$/,
    /^package-lock\.json$/,
    /\.min\.(?:js|css)$/,
    /\.map$/,
]

function mask(value) {
    const text = String(value)
    if (text.length <= 8) {
        return '***'
    }
    return `${text.slice(0, 4)}\u2026(${text.length})`
}

function isIgnored(file) {
    return IGNORED_PATHS.some((pattern) => pattern.test(file))
}

function scanText(file, text) {
    const findings = []
    const lines = text.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        for (const rule of RULES) {
            rule.re.lastIndex = 0
            let match = rule.re.exec(line)
            while (match !== null) {
                findings.push({ file, line: index + 1, rule: rule.id, masked: mask(match[1] || match[0]) })
                match = rule.re.exec(line)
            }
        }
    }
    return findings
}

function git(root, args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function trackedFiles(root) {
    return git(root, ['ls-files', '-z']).split('\0').filter(Boolean)
}

function changedFiles(root, base) {
    return git(root, ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`])
        .split('\n')
        .map((file) => file.trim())
        .filter(Boolean)
}

function readText(root, file) {
    let buffer
    try {
        buffer = readFileSync(join(root, file))
    } catch {
        return null
    }
    if (buffer.subarray(0, 4096).includes(0)) {
        return null
    }
    return buffer.toString('utf8')
}

function scan(options) {
    const files = options.mode === 'range' ? changedFiles(options.root, options.base) : trackedFiles(options.root)
    const findings = []
    for (const file of files) {
        if (isIgnored(file)) {
            continue
        }
        const text = readText(options.root, file)
        if (text === null) {
            continue
        }
        findings.push(...scanText(file, text))
    }
    return findings
}

function parseArgs(argv) {
    const options = { mode: 'all-tracked', root: process.cwd(), base: null }
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--all-tracked') {
            options.mode = 'all-tracked'
        } else if (arg === '--range') {
            options.mode = 'range'
            options.base = argv[index + 1]
            index += 1
            if (!options.base) {
                throw new Error('--range requires a git revision')
            }
        } else if (arg === '--root') {
            options.root = argv[index + 1]
            index += 1
            if (!options.root) {
                throw new Error('--root requires a directory')
            }
        } else {
            throw new Error(`Unknown argument: ${arg}`)
        }
    }
    return options
}

function report(findings) {
    if (findings.length === 0) {
        process.stdout.write('secret-scan: no credentials detected\n')
        return 0
    }
    process.stderr.write(`secret-scan: ${findings.length} potential credential(s) detected\n`)
    for (const finding of findings) {
        process.stderr.write(`  ${finding.file}:${finding.line} ${finding.rule} ${finding.masked}\n`)
    }
    return 1
}

module.exports = { RULES, IGNORED_PATHS, isIgnored, mask, scanText, scan, parseArgs }

if (require.main === module) {
    try {
        process.exitCode = report(scan(parseArgs(process.argv.slice(2))))
    } catch (error) {
        process.stderr.write(`secret-scan: ${error.message}\n`)
        process.exitCode = 1
    }
}
