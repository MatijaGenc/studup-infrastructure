const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { dirname, join } = require('node:path')
const { lintProjectDocs } = require('./check-project-docs.cjs')

const VALID_LEDGER = [
    '# Ledger',
    '',
    '**The full backlog is not complete: 1 primary stories complete, 0 open or partial out of1.**',
    '',
    '### AAA-001 — Done story',
    '',
    '- [x] Criterion one',
    '',
].join('\n')

const BASE_FILES = {
    'README.md': '# Docs\n\n[project](docs/PROJECT.md#section)\n[external](https://example.com/guide?q=1)\n',
    'docs/PROJECT.md': '# Project\n\n## Section\n',
    'docs/chatgpt-tasks.md': VALID_LEDGER,
}

function makeRepo(overrides = {}) {
    const root = mkdtempSync(join(tmpdir(), 'studup-docs-gate-'))
    const files = { ...BASE_FILES, ...overrides }
    for (const [name, content] of Object.entries(files)) {
        const absolute = join(root, name)
        mkdirSync(dirname(absolute), { recursive: true })
        writeFileSync(absolute, content)
    }
    return { root, files: Object.keys(files) }
}

function run(files, options = {}) {
    const { root, files: docFiles } = makeRepo(files)
    try {
        return lintProjectDocs({ root, files: docFiles, ...options })
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

test('a valid snapshot passes link, anchor, URL and ledger validation', () => {
    const result = run()
    assert.equal(result.total, 1)
    assert.equal(result.complete, 1)
    assert.equal(result.open, 0)
})

test('a missing relative Markdown target fails closed', () => {
    assert.throws(
        () => run({ 'README.md': '# Docs\n\n[missing](docs/MISSING.md)\n' }),
        /missing relative Markdown target: docs\/MISSING\.md/,
    )
})

test('a missing Markdown anchor fails closed', () => {
    assert.throws(
        () => run({ 'README.md': '# Docs\n\n[missing](docs/PROJECT.md#not-there)\n' }),
        /missing Markdown anchor #not-there/,
    )
})

test('a malformed external URL is rejected without network access', () => {
    assert.throws(() => run({ 'README.md': '# Docs\n\n[bad](https://exa mple.com)\n' }), /malformed external URL/)
})

test('synthetic credential content fails closed without echoing the value', () => {
    const token = `ghp_${'a'.repeat(36)}`
    try {
        run({ 'README.md': `# Docs\n\nLeaked ${token}\n` })
        assert.fail('expected credential detection to fail')
    } catch (error) {
        assert.match(error.message, /credential-like content detected \(GitHub token\)/)
        assert.ok(!error.message.includes(token))
    }
})

test('duplicate primary IDs are rejected', () => {
    const ledger = [
        '# Ledger',
        '',
        '**The full backlog is not complete: 0 primary stories complete, 2 open or partial out of2.**',
        '',
        '### AAA-001 — First',
        '- [ ] One',
        '',
        '### AAA-001 — Second',
        '- [ ] Two',
        '',
    ].join('\n')
    assert.throws(() => run({ 'docs/chatgpt-tasks.md': ledger }), /duplicate primary ID AAA-001/)
})

test('duplicate primary titles are rejected', () => {
    const ledger = [
        '# Ledger',
        '',
        '**The full backlog is not complete: 0 primary stories complete, 2 open or partial out of2.**',
        '',
        '### AAA-001 — Same title',
        '- [ ] One',
        '',
        '### BBB-001 — Same title',
        '- [ ] Two',
        '',
    ].join('\n')
    assert.throws(() => run({ 'docs/chatgpt-tasks.md': ledger }), /duplicate primary title/)
})

test('stale header totals are rejected', () => {
    const ledger = [
        '# Ledger',
        '',
        '**The full backlog is not complete: 0 primary stories complete, 0 open or partial out of1.**',
        '',
        '### AAA-001 — Done story',
        '- [x] Criterion',
        '',
    ].join('\n')
    assert.throws(() => run({ 'docs/chatgpt-tasks.md': ledger }), /header primary totals do not match derived counts/)
})

test('invalid checkbox markers and missing criteria are rejected', () => {
    const invalid = [
        '# Ledger',
        '',
        '**The full backlog is not complete: 1 primary stories complete, 0 open or partial out of1.**',
        '',
        '### AAA-001 — Story',
        '- [x] Good',
        '- [?] Bad',
        '',
    ].join('\n')
    assert.throws(() => run({ 'docs/chatgpt-tasks.md': invalid }), /invalid checkbox marker in AAA-001/)

    const missingCriteria = [
        '# Ledger',
        '',
        '**The full backlog is not complete: 0 primary stories complete, 1 open or partial out of1.**',
        '',
        '### AAA-001 — Story',
        'No acceptance criteria here.',
        '',
    ].join('\n')
    assert.throws(() => run({ 'docs/chatgpt-tasks.md': missingCriteria }), /missing acceptance criteria checkboxes for AAA-001/)
})

test('fenced examples are ignored instead of counted as headings, checkboxes or links', () => {
    const readme = [
        '# Docs',
        '',
        '```md',
        '[broken](docs/DOES-NOT-EXIST.md)',
        '### FAKE-999 — Fenced story',
        '- [ ] Not a real criterion',
        '```',
        '',
        '[project](docs/PROJECT.md#section)',
        '',
    ].join('\n')
    const ledger = [
        '# Ledger',
        '',
        '**The full backlog is not complete: 1 primary stories complete, 0 open or partial out of1.**',
        '',
        '```md',
        '### FAKE-999 — Fenced story',
        '- [ ] Not a real criterion',
        '```',
        '',
        '### AAA-001 — Done story',
        '- [x] Criterion',
        '',
    ].join('\n')
    const result = run({ 'README.md': readme, 'docs/chatgpt-tasks.md': ledger })
    assert.equal(result.total, 1)
    assert.equal(result.complete, 1)
})

test('inline code in a heading contributes to its real Markdown anchor', () => {
    const result = run({
        'README.md': '# Docs\n\n[setup](docs/PROJECT.md#yarn-prepare)\n',
        'docs/PROJECT.md': '# Project\n\n## `yarn prepare`\n',
    })
    assert.equal(result.total, 1)
})

test('completion trackers are refused before reading them, including ledger overrides', () => {
    const { root } = makeRepo({ 'complete-tasks.md': '# Synthetic refused document\n' })
    try {
        assert.throws(() => lintProjectDocs({ root, files: ['complete-tasks.md'], ledgerPath: null }), /Refusing to read/)
        assert.throws(
            () => lintProjectDocs({ root, files: ['README.md', 'docs/PROJECT.md'], ledgerPath: 'complete-tasks.md' }),
            /Refusing to read/,
        )
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test('a Markdown symlink cannot make the checker read outside the selected repository', () => {
    const { root } = makeRepo()
    const outside = mkdtempSync(join(tmpdir(), 'studup-docs-outside-'))
    try {
        const external = join(outside, 'outside.md')
        writeFileSync(external, '# Synthetic outside document\n')
        symlinkSync(external, join(root, 'alias.md'))
        assert.throws(() => lintProjectDocs({ root, files: ['alias.md'], ledgerPath: null }), /outside the repository/)
    } finally {
        rmSync(root, { recursive: true, force: true })
        rmSync(outside, { recursive: true, force: true })
    }
})
