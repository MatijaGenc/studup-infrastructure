const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { execFileSync } = require('node:child_process')
const root = join(__dirname, '..')
// Never walk upwards and modify a consumer's Git configuration during dependency prepare.
if (existsSync(join(root, '.git'))) {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'inherit' })
}
