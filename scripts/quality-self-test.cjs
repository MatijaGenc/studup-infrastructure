const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { loadCommands, runGateChain } = require('./check.cjs')
for (const failingGate of ['typecheck', 'lint', 'build', 'test']) {
    test(`a failing ${failingGate} child stops later checks and preserves its failure`, () => {
        const dir = mkdtempSync(join(tmpdir(), 'studup-gates-'))
        try {
            const log = join(dir, 'executed.txt')
            const names = ['typecheck', 'lint', 'build', 'test', 'must-not-run']
            const commands = names.map((name) => [
                process.execPath,
                '-e',
                `require('node:fs').appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(name + '\n')}); process.exit(${name === failingGate ? 23 : 0})`,
            ])
            assert.equal(runGateChain(commands, dir), 23)
            assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), names.slice(0, names.indexOf(failingGate) + 1))
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })
}
test('missing commands fail closed rather than reporting success', () => {
    assert.notEqual(runGateChain([['studup-no-such-quality-command']], tmpdir()), 0)
})
test('all required gates are configured and reference real package scripts', () => {
    assert.ok(loadCommands(join(__dirname, '..')).length >= 5)
})
test('a configuration without a build gate is rejected', () => {
    const dir = mkdtempSync(join(tmpdir(), 'studup-gates-config-'))
    try {
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: {}, qualityGates: { manager: 'npm', gates: [] } }))
        assert.throws(() => loadCommands(dir), /Required quality gate missing/)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

for (const deletion of [false, true]) {
    test(`pre-push ${deletion ? 'skips deletion-only updates' : 'propagates a failing code gate'}`, () => {
        const dir = mkdtempSync(join(tmpdir(), 'studup-hook-'))
        try {
            const root = join(__dirname, '..')
            const pkg = require('../package.json')
            const manager = pkg.qualityGates.manager
            const marker = join(dir, 'gate-called')
            const fake = join(dir, manager)
            writeFileSync(fake, `#!/bin/sh\nprintf '%s' invoked > '${marker}'\nexit 17\n`)
            chmodSync(fake, 0o755)
            const hook = existsSync(join(root, '.husky/pre-push'))
                ? join(root, '.husky/pre-push')
                : join(root, '.githooks/pre-push')
            const sha = deletion ? '0'.repeat(40) : '1'.repeat(40)
            const result = require('node:child_process').spawnSync('sh', [hook], {
                cwd: root,
                env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
                input: `refs/heads/task ${sha} refs/heads/task ${'2'.repeat(40)}\n`,
            })
            assert.equal(result.status, deletion ? 0 : 17)
            assert.equal(existsSync(marker), !deletion)
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })
}
