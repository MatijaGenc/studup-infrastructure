const { spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const required = ['typecheck', 'format:check', 'lint', 'build', 'test:quality']
function runGateChain(commands, cwd, spawn = spawnSync) {
    for (const [command, ...args] of commands) {
        const result = spawn(command, args, { cwd, stdio: 'inherit', shell: false })
        if (result.error) process.stderr.write(`${command}: ${result.error.message}\n`)
        if (result.error || result.status !== 0) return result.status || 1
    }
    return 0
}
function loadCommands(root) {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const { manager, gates } = pkg.qualityGates || {}
    if (!['npm', 'pnpm', 'yarn'].includes(manager) || !Array.isArray(gates)) throw new Error('Missing quality gate configuration')
    for (const name of required) {
        if (!gates.includes(name) || !pkg.scripts[name]) throw new Error(`Required quality gate missing: ${name}`)
    }
    if (new Set(gates).size !== gates.length) throw new Error('Duplicate quality gate')
    return gates.map((name) => {
        if (!pkg.scripts[name] || name === 'check') throw new Error(`Invalid quality gate: ${name}`)
        return [manager, 'run', name]
    })
}
module.exports = { loadCommands, runGateChain }
if (require.main === module) {
    const root = join(__dirname, '..')
    try {
        process.exitCode = runGateChain(loadCommands(root), root)
    } catch (error) {
        process.stderr.write(`${error.message}\n`)
        process.exitCode = 1
    }
}
