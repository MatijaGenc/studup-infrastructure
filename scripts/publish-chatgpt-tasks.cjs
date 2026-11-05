#!/usr/bin/env node
const { createHash } = require('node:crypto')
const { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } = require('node:fs')
const { basename, dirname, isAbsolute, join, relative, resolve, sep } = require('node:path')

const REPO_ROOT = resolve(__dirname, '..')
const DEFAULT_SOURCE = resolve(REPO_ROOT, '..', 'chatgpt-tasks.md')
const OUTPUT_PATH = join(REPO_ROOT, 'docs', 'chatgpt-tasks.md')
const LINK_PATTERN = /(!?)\[([^\]]*)\]\(([^()\s]+)(\s+"[^"]*")?\)/g
const LINK_DESTINATION_PATTERN = /!?\[[^\]]*\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g

// Detection is intentionally conservative. It rejects recognizable credential
// formats without printing the matching value, and it runs on both the source
// and the generated snapshot before anything is written.
const CREDENTIAL_PATTERNS = [
    { name: 'AWS access key id', pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|ASCA)[A-Z0-9]{16}\b/ },
    { name: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
    { name: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
    { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
    { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
    { name: 'Stripe secret key', pattern: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/ },
    { name: 'JSON Web Token', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
    {
        name: 'assigned secret value',
        pattern: /(?:^|[^A-Za-z0-9])(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9+/_=-]{16,}/i,
    },
    {
        name: 'credential-bearing connection URL',
        pattern:
            /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp|amqps|https?|ftp|sftp|ssh|mssql|oracle|ldap|ldaps):\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/i,
    },
]

const REFUSED_SOURCE_BASENAMES = new Set(['complete-tasks.md', '.env'])

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toPosix(value) {
    return value.split(sep).join('/')
}

function isInside(parent, target) {
    const candidate = relative(parent, target)
    return candidate === '' || (!candidate.startsWith('..') && !isAbsolute(candidate))
}

function portablePathLabel(target, workspaceRoot) {
    if (isInside(workspaceRoot, target)) return `<workspace>/${toPosix(relative(workspaceRoot, target))}`
    return toPosix(target)
}

function scanForCredentials(text) {
    return CREDENTIAL_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name)
}

function assertNoCredentials(text, label) {
    const findings = scanForCredentials(text)
    if (findings.length > 0) {
        throw new Error(`Refusing to publish: ${label} contains credential-like content (${findings.join(', ')})`)
    }
}

function validateDate(value) {
    const format = /^\d{4}-\d{2}-\d{2}$/
    const parsed = format.test(value) ? new Date(`${value}T00:00:00.000Z`) : undefined
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new Error('Published date must use a valid YYYY-MM-DD calendar date')
    }
    return value
}

function assertPublishableSourcePath(candidate) {
    const name = basename(candidate).toLowerCase()
    if (REFUSED_SOURCE_BASENAMES.has(name) || name.startsWith('.env.')) {
        throw new Error(
            `Refusing to read ${basename(candidate)}: environment and completion-tracker files are not publish sources`,
        )
    }
    if (/\.log$/i.test(name) || /(^|[\\/])logs?([\\/]|$)/i.test(candidate)) {
        throw new Error(`Refusing to read ${basename(candidate)}: log files are not publish sources`)
    }
    if (!/\.md$/i.test(name)) {
        throw new Error(`Refusing to read ${basename(candidate)}: publish sources must be Markdown (.md) files`)
    }
}

function validateSource(sourcePath) {
    const resolved = resolve(sourcePath)
    if (!existsSync(resolved)) throw new Error(`Source task ledger not found: ${resolved}`)
    const stats = statSync(resolved)
    if (!stats.isFile()) throw new Error(`Source task ledger is not a regular file: ${resolved}`)
    assertPublishableSourcePath(resolved)
    const realPath = realpathSync(resolved)
    assertPublishableSourcePath(realPath)
    return { path: resolved, realPath }
}

function assertPublishableSourceText(text) {
    if (!text.trim()) throw new Error('Refusing to publish: source task ledger is empty')
    if (!/(^|\n)#{1,6}[ \t]+\S/.test(text)) {
        throw new Error('Refusing to publish: source task ledger must contain a Markdown title')
    }
}

function normalizeWorkspacePaths(text, workspaceRoot) {
    const root = toPosix(workspaceRoot)
    const pattern = new RegExp(`${escapeRegExp(root)}(?![A-Za-z0-9._-])`, 'g')
    return text.replace(pattern, '<workspace>')
}

function rewriteMarkdownLinks(text, { workspaceRoot, repoRoot, outputPath }) {
    return text.replace(LINK_PATTERN, (match, imageMarker, label, destination, title = '') => {
        if (/^(?:https?:|mailto:)/i.test(destination) || destination.startsWith('#')) return match

        const hashIndex = destination.indexOf('#')
        const targetPart = hashIndex === -1 ? destination : destination.slice(0, hashIndex)
        const anchor = hashIndex === -1 ? '' : destination.slice(hashIndex)
        if (!targetPart) return match

        const target = isAbsolute(targetPart) ? resolve(targetPart) : resolve(workspaceRoot, decodeURIComponent(targetPart))
        if (isInside(repoRoot, target) && existsSync(target)) {
            const rewritten = toPosix(relative(dirname(outputPath), target)) + anchor
            return `${imageMarker}[${label}](${rewritten}${title})`
        }

        const portable = `${portablePathLabel(target, workspaceRoot)}${anchor}`
        const evidenceLabel = label.trim() || 'local evidence'
        return `${evidenceLabel} — local evidence: \`${portable}\` (not published)`
    })
}

function normalizePublication(text, options) {
    return normalizeWorkspacePaths(rewriteMarkdownLinks(text, options), options.workspaceRoot)
}

function assertLinksResolvable(text, outputPath) {
    for (const match of text.matchAll(LINK_DESTINATION_PATTERN)) {
        const destination = match[1]
        if (/^(?:https?:|mailto:)/i.test(destination) || destination.startsWith('#')) continue
        const targetPart = destination.split('#')[0]
        const target = isAbsolute(targetPart) ? resolve(targetPart) : resolve(dirname(outputPath), targetPart)
        if (!existsSync(target)) {
            throw new Error('Refusing to publish: generated snapshot would contain a broken relative Markdown link')
        }
    }
}

function renderHeader({ digest, publishedDate, sourceLabel }) {
    return [
        '<!-- Generated by scripts/publish-chatgpt-tasks.cjs. Do not edit this snapshot by hand. -->',
        `> **Published task-ledger snapshot — ${publishedDate}.**`,
        '>',
        `> Source: local master \`${sourceLabel}\` outside this repository. Source-SHA256: \`${digest}\`.`,
        `> Published-Date: \`${publishedDate}\`.`,
        '> This Git-tracked file is the canonical published ledger. The local working copy remains the editable master and',
        '> may contain newer, unpublished statuses. Update this snapshot only after a verified delivery by running',
        '> `npm run publish:tasks`, then review and publish through the normal repository process.',
        '>',
        '> Workspace paths are shown as `<workspace>/...`. Local evidence is not included in this repository and is not',
        '> remote proof or a substitute for CI, deployment or live-verification evidence.',
        '',
    ].join('\n')
}

function writeAtomic(outputPath, content) {
    mkdirSync(dirname(outputPath), { recursive: true })
    const temporary = join(dirname(outputPath), `.${basename(outputPath)}.${process.pid}.${Date.now()}.tmp`)
    try {
        writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o644 })
        renameSync(temporary, outputPath)
    } catch (error) {
        rmSync(temporary, { force: true })
        throw error
    }
}

function publishTaskLedger(options = {}) {
    const sourcePath = resolve(options.sourcePath || DEFAULT_SOURCE)
    const outputPath = resolve(options.outputPath || OUTPUT_PATH)
    const repoRoot = resolve(options.repoRoot || REPO_ROOT)
    const publishedDate = validateDate(options.publishedDate || new Date().toISOString().slice(0, 10))
    const source = validateSource(sourcePath)

    const outputRealPath = existsSync(outputPath) ? realpathSync(outputPath) : outputPath
    if (source.realPath === outputRealPath) throw new Error('Refusing to overwrite the source task ledger')

    const sourceBytes = readFileSync(source.realPath)
    const sourceText = sourceBytes.toString('utf8')
    assertPublishableSourceText(sourceText)
    const workspaceRoot = resolve(options.workspaceRoot || dirname(source.path))
    assertNoCredentials(sourceText, 'source task ledger')

    const normalized = normalizePublication(sourceText, { workspaceRoot, repoRoot, outputPath })
    if (normalized.includes(toPosix(workspaceRoot))) {
        throw new Error('Refusing to publish: an absolute workspace path remained in the generated snapshot')
    }
    assertLinksResolvable(normalized, outputPath)
    assertNoCredentials(normalized, 'generated snapshot')

    const digest = createHash('sha256').update(sourceBytes).digest('hex')
    const header = renderHeader({
        digest,
        publishedDate,
        sourceLabel: toPosix(relative(workspaceRoot, source.path)),
    })
    const output = `${header}\n${normalized}`
    writeAtomic(outputPath, output)

    return {
        outputPath,
        sourcePath: source.path,
        digest,
        publishedDate,
        bytes: Buffer.byteLength(output, 'utf8'),
        lines: output.split('\n').length,
    }
}

function parseArgs(argv) {
    let sourcePath
    let publishedDate
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index]
        if (argument === '--help' || argument === '-h') return { help: true }
        if (argument === '--date') {
            index += 1
            if (!argv[index]) throw new Error('--date requires a YYYY-MM-DD value')
            publishedDate = validateDate(argv[index])
            continue
        }
        if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`)
        if (sourcePath) throw new Error('Only one source path may be provided')
        sourcePath = argument
    }
    return { sourcePath, publishedDate }
}

function main() {
    try {
        const options = parseArgs(process.argv.slice(2))
        if (options.help) {
            console.log('Usage: node scripts/publish-chatgpt-tasks.cjs [--date YYYY-MM-DD] [source-path]')
            console.log('Default source: ../chatgpt-tasks.md relative to this repository.')
            return
        }
        const result = publishTaskLedger(options)
        console.log(`Published ${toPosix(relative(REPO_ROOT, result.outputPath))} (${result.lines} lines).`)
        console.log(`Source-SHA256: ${result.digest}`)
        console.log(`Published-Date: ${result.publishedDate}`)
    } catch (error) {
        process.stderr.write(`${error.message}\n`)
        process.exitCode = 1
    }
}

module.exports = {
    CREDENTIAL_PATTERNS,
    DEFAULT_SOURCE,
    OUTPUT_PATH,
    normalizePublication,
    parseArgs,
    publishTaskLedger,
    renderHeader,
    scanForCredentials,
}

if (require.main === module) main()
