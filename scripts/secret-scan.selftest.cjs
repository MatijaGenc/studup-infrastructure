const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isIgnored, mask, scanText } = require('./secret-scan.cjs')

const build = (...parts) => parts.join('')

test('detects a classic GitHub personal access token', () => {
    const token = build('ghp', '_', 'a1B2c3D4'.repeat(4), 'e5F6')
    const findings = scanText('src/config.ts', `const token = '${token}'`)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].rule, 'github-pat-classic')
    assert.equal(findings[0].line, 1)
})

test('detects an AWS access key id without exposing it', () => {
    const key = build('AKIA', 'IOSFODNN7EXAMPLE')
    const findings = scanText('deploy.sh', `export KEY=${key}`)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].rule, 'aws-access-key-id')
    assert.equal(findings[0].masked.includes(key), false)
})

test('detects a private key header', () => {
    const header = build('-----BEGIN ', 'RSA PRIVATE ', 'KEY-----')
    const findings = scanText('id_rsa', header)
    assert.equal(findings.length, 1)
    assert.equal(findings[0].rule, 'private-key')
})

test('does not flag placeholders or short values', () => {
    assert.deepEqual(scanText('.env.example', 'AWS_SECRET_ACCESS_KEY=changeme\nDATABASE_PASSWORD=postgres'), [])
    assert.deepEqual(scanText('README.md', 'Use a token like [REDACTED_GITHUB_PAT_1]'), [])
})

test('ignores generated output, bundles, and lockfiles', () => {
    for (const file of [
        'node_modules/pkg/index.js',
        '.yarn/releases/yarn-4.18.0.cjs',
        '.yarn/cache/pkg.zip',
        'build/assets/index.js',
        'dist/index.js',
        'coverage/lcov.info',
        'graphify-out/graph.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        'e2e/audit-results/run.json',
        'app.min.js',
    ]) {
        assert.equal(isIgnored(file), true, file)
    }
    assert.equal(isIgnored('src/main.ts'), false)
})

test('masks findings and reports every occurrence on a line', () => {
    const first = build('ghp', '_', 'a'.repeat(36))
    const second = build('ghp', '_', 'b'.repeat(36))
    const findings = scanText('src/a.ts', `${first} ${second}`)
    assert.equal(findings.length, 2)
    assert.equal(findings[0].masked.includes(first), false)
    assert.equal(findings[1].masked.includes(second), false)
    assert.equal(mask('short'), '***')
})
