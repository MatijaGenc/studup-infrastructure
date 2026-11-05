const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { parseArgs, publishTaskLedger, scanForCredentials } = require('./publish-chatgpt-tasks.cjs')

const DATE = '2026-11-05'

function fixture(sourceText, { sourceName = 'chatgpt-tasks.md', writeSource = true } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'studup-ledger-'))
    const workspace = join(root, 'workspace')
    const repo = join(workspace, 'repo')
    const source = join(workspace, sourceName)
    mkdirSync(join(repo, 'docs'), { recursive: true })
    if (writeSource) writeFileSync(source, sourceText)
    return {
        root,
        workspace,
        repo,
        source,
        output: join(repo, 'docs', 'chatgpt-tasks.md'),
        cleanup: () => rmSync(root, { recursive: true, force: true }),
    }
}

function publish(fixtureValue, overrides = {}) {
    return publishTaskLedger({
        sourcePath: fixtureValue.source,
        outputPath: fixtureValue.output,
        repoRoot: fixtureValue.repo,
        publishedDate: DATE,
        ...overrides,
    })
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex')
}

test('missing, directory and refused sources fail closed without creating or replacing output', () => {
    const missing = fixture('', { writeSource: false })
    try {
        writeFileSync(missing.output, 'existing snapshot\n')
        assert.throws(() => publish(missing), /not found/)
        assert.equal(readFileSync(missing.output, 'utf8'), 'existing snapshot\n')
    } finally {
        missing.cleanup()
    }

    const directory = fixture('', { writeSource: false })
    try {
        mkdirSync(directory.source)
        assert.throws(() => publish(directory), /not a regular file/)
        assert.equal(existsSync(directory.output), false)
    } finally {
        directory.cleanup()
    }

    for (const sourceName of ['complete-tasks.md', '.env', 'session.log']) {
        const refused = fixture('do not publish\n', { sourceName })
        try {
            assert.throws(() => publish(refused), /not publish sources/)
            assert.equal(existsSync(refused.output), false)
        } finally {
            refused.cleanup()
        }
    }
})

test('symlinked sources are checked against the resolved target before any file is read', () => {
    for (const [targetName, expected] of [
        ['complete-tasks.md', /not publish sources/],
        ['.env', /not publish sources/],
        ['session.log', /not publish sources/],
        ['notes.txt', /must be Markdown/],
    ]) {
        const value = fixture('', { sourceName: 'alias.md', writeSource: false })
        const target = join(value.workspace, targetName)
        try {
            writeFileSync(target, '# Tasks\n\n- [ ] this content must never be read\n')
            chmodSync(target, 0o000)
            symlinkSync(target, value.source)
            assert.throws(
                () => publish(value),
                (error) => {
                    assert.match(error.message, expected)
                    assert.doesNotMatch(error.message, /EACCES|permission denied/i)
                    assert.ok(!error.message.includes('must never be read'))
                    return true
                },
            )
            assert.equal(existsSync(value.output), false)
        } finally {
            chmodSync(target, 0o600)
            value.cleanup()
        }
    }
})

test('sources must be non-empty Markdown files with a Markdown title', () => {
    const cases = [
        ['notes.txt', '# Tasks\n', /must be Markdown/],
        ['empty.md', '', /is empty/],
        ['blank.md', ' \n\t\n', /is empty/],
        ['untitled.md', 'Status: DONE\n\n- [ ] no title\n', /Markdown title/],
    ]
    for (const [sourceName, sourceText, expected] of cases) {
        const value = fixture(sourceText, { sourceName })
        try {
            assert.throws(() => publish(value), expected)
            assert.equal(existsSync(value.output), false)
        } finally {
            value.cleanup()
        }
    }
})

test('source and output aliases are never overwritten', () => {
    const value = fixture('# Tasks\n\n- [ ] keep the source\n')
    try {
        assert.throws(() => publish(value, { outputPath: value.source }), /Refusing to overwrite the source/)
        assert.equal(readFileSync(value.source, 'utf8'), '# Tasks\n\n- [ ] keep the source\n')
    } finally {
        value.cleanup()
    }
})

test('publication adds a deterministic digest/date header and preserves the task body exactly', () => {
    const body = '# Tasks\n\nStatus: **DONE**\n\n- [x] shipped\n- [ ] open\n\n| A | B |\n| --- | --- |\n| `code` | text |\n'
    const value = fixture(body)
    try {
        const result = publish(value)
        const output = readFileSync(value.output, 'utf8')
        assert.equal(result.digest, sha256(body))
        assert.match(output, new RegExp(`Source-SHA256: \`${result.digest}\``))
        assert.ok(output.includes(`Published-Date: \`${DATE}\``))
        assert.ok(output.endsWith(body))
        assert.deepEqual(scanForCredentials(output), [])
        assert.equal(readFileSync(value.source, 'utf8'), body)

        publish(value)
        assert.equal(readFileSync(value.output, 'utf8'), output)
    } finally {
        value.cleanup()
    }
})

test('workspace paths and local evidence links become portable and are never broken Markdown links', () => {
    const value = fixture('')
    try {
        const source = [
            '# Tasks',
            '',
            'Status: **DONE**',
            '',
            '- [x] remote [CI run](https://github.com/org/repo/actions/runs/1)',
            '- [x] relative [local report](./evidence/report.md)',
            `- [x] absolute [absolute report](${value.workspace}/evidence/absolute.md)`,
            '- [x] repo [README](repo/README.md)',
            '- [ ] anchor [section](#task-list)',
            '',
            `Evidence: \`${value.workspace}/evidence/dir/\`.`,
            '',
        ].join('\n')
        writeFileSync(value.source, source)
        mkdirSync(join(value.repo, 'docs'), { recursive: true })
        writeFileSync(join(value.repo, 'README.md'), '# Repo\n')

        publish(value)
        const output = readFileSync(value.output, 'utf8')
        assert.ok(!output.includes(value.workspace))
        assert.ok(output.includes('<workspace>/evidence/dir/'))
        assert.ok(output.includes('local report — local evidence: `<workspace>/evidence/report.md` (not published)'))
        assert.ok(output.includes('absolute report — local evidence: `<workspace>/evidence/absolute.md` (not published)'))
        assert.ok(output.includes('[README](../README.md)'))
        assert.ok(output.includes('[CI run](https://github.com/org/repo/actions/runs/1)'))
        assert.ok(output.includes('[section](#task-list)'))
        assert.ok(!output.includes('](./evidence/report.md)'))
        assert.equal((output.match(/- \[x\]/g) || []).length, 4)
        assert.equal((output.match(/- \[ \]/g) || []).length, 1)
    } finally {
        value.cleanup()
    }
})

test('credential-like source content is rejected without printing the value or replacing output', () => {
    const secrets = [
        `AKIA${'A'.repeat(16)}`,
        `ghp_${'b'.repeat(30)}`,
        `sk_live_${'c'.repeat(20)}`,
        `-----BEGIN ${'PRIVATE KEY-----'}`,
    ]
    for (const secret of secrets) {
        const value = fixture(`# Tasks\n\n- [ ] remove ${secret}\n`)
        try {
            writeFileSync(value.output, 'previous reviewed snapshot\n')
            assert.throws(
                () => publish(value),
                (error) => {
                    assert.match(error.message, /credential-like content/)
                    assert.ok(!error.message.includes(secret))
                    return true
                },
            )
            assert.equal(readFileSync(value.output, 'utf8'), 'previous reviewed snapshot\n')
            assert.equal(readFileSync(value.source, 'utf8'), `# Tasks\n\n- [ ] remove ${secret}\n`)
        } finally {
            value.cleanup()
        }
    }
})

test('credential-bearing connection URLs are rejected without disclosing short passwords', () => {
    const connectionUrl = (scheme, password) =>
        [scheme, '://', 'fixture-user', ':', password, '@', 'db.invalid', '/ledger'].join('')
    for (const scheme of ['postgres', 'mysql', 'http']) {
        const password = 'pw7'
        const url = connectionUrl(scheme, password)
        const value = fixture(`# Tasks\n\n- [ ] remove ${url}\n`)
        try {
            writeFileSync(value.output, 'previous reviewed snapshot\n')
            assert.throws(
                () => publish(value),
                (error) => {
                    assert.match(error.message, /credential-like content/)
                    assert.match(error.message, /credential-bearing connection URL/)
                    assert.ok(!error.message.includes(url))
                    assert.ok(!error.message.includes(password))
                    return true
                },
            )
            assert.equal(readFileSync(value.output, 'utf8'), 'previous reviewed snapshot\n')
        } finally {
            value.cleanup()
        }
    }
})

test('link handling rejects every non-remote destination that cannot resolve in the published repository', () => {
    const value = fixture('# Tasks\n\n[remote](https://example.com/a) [anchor](#tasks) [missing](missing/report.md)\n')
    try {
        publish(value)
        const output = readFileSync(value.output, 'utf8')
        assert.ok(output.includes('[remote](https://example.com/a)'))
        assert.ok(output.includes('[anchor](#tasks)'))
        assert.ok(output.includes('missing — local evidence: `<workspace>/missing/report.md` (not published)'))
        assert.ok(!output.includes('](missing/report.md)'))
    } finally {
        value.cleanup()
    }
})

test('publication rejects impossible calendar dates instead of accepting normalized dates', () => {
    const value = fixture('# Tasks\n\n- [ ] keep\n')
    try {
        for (const publishedDate of ['2026-02-31', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10']) {
            writeFileSync(value.output, 'previous reviewed snapshot\n')
            assert.throws(() => publish(value, { publishedDate }), /valid YYYY-MM-DD calendar date/)
            assert.equal(readFileSync(value.output, 'utf8'), 'previous reviewed snapshot\n')
        }
        assert.equal(publish(value, { publishedDate: '2024-02-29' }).publishedDate, '2024-02-29')
    } finally {
        value.cleanup()
    }
})

test('argument parsing accepts one optional source and validates options', () => {
    assert.deepEqual(parseArgs([]), { sourcePath: undefined, publishedDate: undefined })
    assert.deepEqual(parseArgs(['/tmp/ledger.md']), { sourcePath: '/tmp/ledger.md', publishedDate: undefined })
    assert.equal(parseArgs(['--date', DATE, '/tmp/ledger.md']).publishedDate, DATE)
    assert.equal(parseArgs(['--help']).help, true)
    assert.throws(() => parseArgs(['--unknown']), /Unknown option/)
    assert.throws(() => parseArgs(['--date', 'not-a-date']), /YYYY-MM-DD/)
    assert.throws(() => parseArgs(['--date', '2026-02-31']), /calendar date/)
    assert.throws(() => parseArgs(['one.md', 'two.md']), /Only one source path/)
})
