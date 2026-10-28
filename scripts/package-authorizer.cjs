const { mkdtempSync, copyFileSync, readdirSync, statSync, utimesSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { execFileSync } = require('node:child_process')
const root = join(__dirname, '..')
const source = join(root, 'authorizer')
const stage = mkdtempSync(join(tmpdir(), 'studup-authorizer-'))
const date = new Date('2020-01-01T00:00:00Z')
function normalize(path) {
    if (statSync(path).isDirectory()) for (const name of readdirSync(path)) normalize(join(path, name))
    utimesSync(path, date, date)
}
try {
    for (const file of ['package.json', 'package-lock.json', 'index.mjs', 'token-policy.mjs'])
        copyFileSync(join(source, file), join(stage, file))
    execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: stage, stdio: 'inherit' })
    rmSync(join(stage, 'package.json'))
    rmSync(join(stage, 'package-lock.json'))
    normalize(stage)
    const archive = join(root, 'authorizer.zip')
    rmSync(archive, { force: true })
    execFileSync('zip', ['-X', '-qr', archive, 'index.mjs', 'token-policy.mjs', 'node_modules'], { cwd: stage, stdio: 'inherit' })
    const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
    if (!entries.includes('token-policy.mjs') || entries.includes('node_modules/typescript/'))
        throw new Error('Invalid authorizer runtime archive')
} finally {
    rmSync(stage, { recursive: true, force: true })
}
