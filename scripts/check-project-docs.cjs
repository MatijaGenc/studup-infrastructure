#!/usr/bin/env node
const { existsSync, readFileSync, readdirSync, realpathSync, statSync } = require('node:fs')
const { basename, dirname, extname, join, relative, resolve, sep } = require('node:path')
const { scanForCredentials } = require('./publish-chatgpt-tasks.cjs')

const REPO_ROOT = resolve(__dirname, '..')
const LEDGER_PATH = 'docs/chatgpt-tasks.md'
const DEFAULT_DOC_FILES = [
    'README.md',
    'docs/PROJECT.md',
    'docs/STATUS_GUIDE.md',
    'docs/MOBILE_TODO_RECONCILIATION.md',
    LEDGER_PATH,
]
const ARCHIVE_DIRS = ['archive', 'docs/archive']
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])
const PRIMARY_HEADING_PATTERN = /^###\s+([A-Z]+-\d{3})\s+—\s+(.+?)\s*$/
const HEADING_PATTERN = /^\s{0,3}(#{1,6})\s+(.+?)\s*$/
const SECTION_BOUNDARY_PATTERN = /^\s{0,3}#{1,3}\s+/
const CHECKBOX_PATTERN = /^\s*[-*+]\s+\[([^\]]*)\](?:\s+|$)/
const MALFORMED_CHECKBOX_PATTERN = /^\s*[-*+]\s+\[/
const LINK_PATTERN = /!?\[([^\]]*)\]\(([^)]*)\)/g
const HEADER_COUNT_PATTERN = /(\d+)\s+primary stories complete,\s*(\d+)\s+open or partial out of\s*(\d+)/

function toPosix(value) {
    return value.split(sep).join('/')
}

function isMarkdown(value) {
    return MARKDOWN_EXTENSIONS.has(extname(value).toLowerCase())
}

function isInside(parent, target) {
    const candidate = relative(parent, target)
    return candidate === '' || (candidate !== '..' && !candidate.startsWith(`..${sep}`))
}

function collectDefaultDocFiles(root) {
    const files = [...DEFAULT_DOC_FILES]
    for (const dir of ARCHIVE_DIRS) {
        const absolute = join(root, dir)
        if (!existsSync(absolute) || !statSync(absolute).isDirectory()) continue
        for (const name of readdirSync(absolute).sort()) {
            const candidate = join(absolute, name)
            if (isMarkdown(name) && statSync(candidate).isFile()) files.push(toPosix(relative(root, candidate)))
        }
    }
    return [...new Set(files)]
}

function maskInlineCode(line) {
    let masked = ''
    let index = 0
    while (index < line.length) {
        if (line[index] !== '`') {
            masked += line[index]
            index += 1
            continue
        }
        let ticks = 0
        while (line[index + ticks] === '`') ticks += 1
        const marker = '`'.repeat(ticks)
        const end = line.indexOf(marker, index + ticks)
        if (end === -1) return masked + line.slice(index)
        masked += ' '.repeat(end + ticks - index)
        index = end + ticks
    }
    return masked
}

function visibleMarkdownLines(text, maskCode = true) {
    const lines = text.split(/\r?\n/)
    let fence = null
    return lines.map((raw) => {
        const marker = raw.match(/^\s{0,3}(`{3,}|~{3,})/)
        if (fence) {
            if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
            return ''
        }
        if (marker) {
            fence = marker[1]
            return ''
        }
        return maskCode ? maskInlineCode(raw) : raw.replace(/`+/g, '')
    })
}

function extractHeadings(lines) {
    const headings = []
    for (const line of lines) {
        const match = line.match(HEADING_PATTERN)
        if (match) headings.push({ level: match[1].length, text: match[2].replace(/\s+#+\s*$/, '').trim() })
    }
    return headings
}

function slugify(text) {
    return text
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]*>/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/\s/g, '-')
}

function collectAnchors(text) {
    const lines = visibleMarkdownLines(text, false)
    const anchors = new Set()
    const counts = new Map()
    for (const heading of extractHeadings(lines)) {
        const base = slugify(heading.text)
        const count = counts.get(base) || 0
        counts.set(base, count + 1)
        anchors.add(count === 0 ? base : `${base}-${count}`)
    }
    for (const line of lines) {
        for (const match of line.matchAll(/<a\s+[^>]*(?:name|id)=["']([^"']+)["']/gi)) anchors.add(match[1])
        for (const match of line.matchAll(/\bid=["']([^"']+)["']/gi)) anchors.add(match[1])
    }
    return anchors
}

function splitLinkTarget(raw) {
    const value = raw.trim()
    if (!value) return ''
    if (value.startsWith('<')) {
        const end = value.indexOf('>')
        return end === -1 ? value : value.slice(1, end)
    }
    const titled = value.match(/^(\S+)\s+(?:"[^"]*"|'[^']*'|\([^)]*\))$/)
    return titled ? titled[1] : value
}

function extractLinks(text) {
    const links = []
    visibleMarkdownLines(text).forEach((line, index) => {
        for (const match of line.matchAll(LINK_PATTERN)) {
            links.push({ destination: splitLinkTarget(match[2]), line: index + 1 })
        }
    })
    return links
}

function assertExternalUrl(destination, label) {
    let parsed
    try {
        parsed = new URL(destination)
    } catch {
        throw new Error(`${label}: malformed external URL`)
    }
    if (parsed.protocol === 'mailto:') {
        if (!/^[^@\s]+@[^@\s]+$/.test(parsed.pathname)) throw new Error(`${label}: malformed mailto URL`)
        return
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`${label}: unsupported external URL scheme`)
    }
    if (!parsed.hostname || /\s/.test(destination)) throw new Error(`${label}: malformed external URL`)
}

function resolveLocalTarget(destination, sourcePath, root, label) {
    const [pathPart, ...rest] = destination.split('#')
    const fragment = rest.join('#')
    let decodedPath
    let decodedFragment
    try {
        decodedPath = decodeURIComponent(pathPart)
        decodedFragment = decodeURIComponent(fragment)
    } catch {
        throw new Error(`${label}: malformed relative Markdown link`)
    }
    if (decodedPath.startsWith('/')) throw new Error(`${label}: absolute or protocol-relative Markdown link is not allowed`)
    const target = decodedPath ? resolve(dirname(sourcePath), decodedPath) : sourcePath
    if (!isInside(root, target)) throw new Error(`${label}: relative Markdown link escapes the repository`)
    return { target, fragment: decodedFragment }
}

function assertLocalLink(destination, sourcePath, root, label) {
    const { target, fragment } = resolveLocalTarget(destination, sourcePath, root, label)
    if (!existsSync(target)) {
        throw new Error(`${label}: missing relative Markdown target: ${toPosix(relative(root, target))}`)
    }
    const stats = statSync(target)
    if (fragment) {
        if (!stats.isFile() || !isMarkdown(target)) {
            throw new Error(`${label}: cannot resolve Markdown anchor in a non-Markdown target`)
        }
        assertSafeMarkdownRead(target, root, label)
        if (!collectAnchors(readFileSync(target, 'utf8')).has(fragment)) {
            throw new Error(`${label}: missing Markdown anchor #${fragment}`)
        }
    }
}

function assertSafeMarkdownRead(absolute, root, label) {
    const real = realpathSync(absolute)
    for (const candidate of [absolute, real]) {
        const name = basename(candidate).toLowerCase()
        if (name === 'complete-tasks.md' || name === '.env' || name.startsWith('.env.')) {
            throw new Error(`${label}: Refusing to read completion trackers or environment files`)
        }
        if (!isMarkdown(candidate)) throw new Error(`${label}: Refusing to read a non-Markdown document`)
    }
    if (!isInside(realpathSync(root), real)) throw new Error(`${label}: document resolves outside the repository`)
}

function validateDocument(absolute, label, root) {
    assertSafeMarkdownRead(absolute, root, label)
    const text = readFileSync(absolute, 'utf8')
    const findings = scanForCredentials(text)
    if (findings.length > 0) {
        throw new Error(`${label}: credential-like content detected (${findings.join(', ')})`)
    }
    for (const link of extractLinks(text)) {
        const destination = link.destination
        const linkLabel = `${label}:${link.line}`
        if (!destination) continue
        if (destination.startsWith('#')) {
            assertLocalLink(destination, absolute, root, linkLabel)
            continue
        }
        if (/^(?:https?|mailto):/i.test(destination)) {
            assertExternalUrl(destination, linkLabel)
            continue
        }
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination)) {
            throw new Error(`${linkLabel}: unsupported external URL scheme`)
        }
        assertLocalLink(destination, absolute, root, linkLabel)
    }
    return text
}

function parseHeaderCounts(text, label) {
    const match = visibleMarkdownLines(text).join('\n').match(HEADER_COUNT_PATTERN)
    if (!match) throw new Error(`${label}: missing primary story totals header`)
    return { complete: Number(match[1]), open: Number(match[2]), total: Number(match[3]) }
}

function parseLedger(text, label) {
    const lines = visibleMarkdownLines(text)
    const sections = []
    let current = null
    for (const line of lines) {
        const primary = line.match(PRIMARY_HEADING_PATTERN)
        if (primary) {
            current = { id: primary[1], title: primary[2], criteria: [], malformed: [] }
            sections.push(current)
            continue
        }
        if (SECTION_BOUNDARY_PATTERN.test(line)) {
            current = null
            continue
        }
        if (!current) continue
        const checkbox = line.match(CHECKBOX_PATTERN)
        if (checkbox) {
            const mark = checkbox[1]
            if (mark === ' ' || mark === 'x' || mark === 'X') current.criteria.push(mark)
            else current.malformed.push(mark)
            continue
        }
        if (MALFORMED_CHECKBOX_PATTERN.test(line)) current.malformed.push('unclosed')
    }
    if (sections.length === 0) throw new Error(`${label}: no canonical primary story headings found`)

    const ids = new Set()
    const titles = new Set()
    for (const section of sections) {
        if (ids.has(section.id)) throw new Error(`${label}: duplicate primary ID ${section.id}`)
        ids.add(section.id)
        const titleKey = section.title.toLowerCase().replace(/\s+/g, ' ').trim()
        if (titles.has(titleKey)) throw new Error(`${label}: duplicate primary title for ${section.id}`)
        titles.add(titleKey)
        if (section.malformed.length > 0) throw new Error(`${label}: invalid checkbox marker in ${section.id}`)
        if (section.criteria.length === 0) throw new Error(`${label}: missing acceptance criteria checkboxes for ${section.id}`)
    }

    const complete = sections.filter((section) => section.criteria.every((mark) => mark === 'x' || mark === 'X')).length
    const total = sections.length
    const open = total - complete
    const header = parseHeaderCounts(text, label)
    if (header.complete !== complete || header.open !== open || header.total !== total) {
        throw new Error(
            `${label}: header primary totals do not match derived counts (${complete} complete, ${open} open, ${total} total)`,
        )
    }
    return { sections, complete, open, total, header }
}

function lintProjectDocs(options = {}) {
    const root = resolve(options.root || REPO_ROOT)
    const requested = options.files || collectDefaultDocFiles(root)
    const files = [...new Set(requested.map(toPosix))]
    const missing = []
    for (const file of files) {
        const absolute = resolve(root, file)
        if (!isInside(root, absolute)) throw new Error(`Documentation file escapes the repository: ${file}`)
        if (!isMarkdown(file)) throw new Error(`Documentation gate only reads Markdown files: ${file}`)
        if (!existsSync(absolute) || !statSync(absolute).isFile()) missing.push(file)
    }
    if (missing.length > 0) throw new Error(`Missing required documentation file(s): ${missing.join(', ')}`)

    const texts = new Map()
    for (const file of files) {
        const absolute = resolve(root, file)
        texts.set(file, validateDocument(absolute, file, root))
    }

    const ledgerFile = options.ledgerPath === null ? null : toPosix(options.ledgerPath || LEDGER_PATH)
    let ledger = { sections: [], complete: 0, open: 0, total: 0, header: null }
    if (ledgerFile) {
        const absolute = resolve(root, ledgerFile)
        if (!isInside(root, absolute)) throw new Error(`Task ledger escapes the repository: ${ledgerFile}`)
        if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error(`Missing task ledger: ${ledgerFile}`)
        assertSafeMarkdownRead(absolute, root, ledgerFile)
        let text = texts.get(ledgerFile)
        if (text === undefined) {
            text = readFileSync(absolute, 'utf8')
            const findings = scanForCredentials(text)
            if (findings.length > 0) throw new Error(`${ledgerFile}: credential-like content detected (${findings.join(', ')})`)
        }
        ledger = parseLedger(text, ledgerFile)
    }

    return { files, ...ledger }
}

function main() {
    try {
        const result = lintProjectDocs()
        console.log(
            `Documentation checks passed: ${result.files.length} files; ${result.total} primary stories (${result.complete} complete, ${result.open} open or partial).`,
        )
    } catch (error) {
        process.stderr.write(`${error.message}\n`)
        process.exitCode = 1
    }
}

module.exports = {
    DEFAULT_DOC_FILES,
    collectAnchors,
    collectDefaultDocFiles,
    lintProjectDocs,
    parseLedger,
    slugify,
    splitLinkTarget,
    visibleMarkdownLines,
}

if (require.main === module) main()
