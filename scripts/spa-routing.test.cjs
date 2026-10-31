const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const vm = require('node:vm')

const code = readFileSync(require('node:path').join(__dirname, '../cloudfront-functions/spa-routing.js'), 'utf8')
const context = {}
vm.createContext(context)
vm.runInContext(code, context)
const route = (uri) => context.handler({ request: { uri } }).uri

test('routes every known SPA entry to index.html', () => {
    for (const uri of [
        '/landing',
        '/auth',
        '/privacy',
        '/home',
        '/about-me',
        '/support',
        '/requests-and-complains',
        '/alerts',
        '/admin',
        '/notifications',
        '/auth/',
    ])
        assert.equal(route(uri), '/index.html', uri)
})

test('preserves assets, root and unknown URLs', () => {
    for (const uri of ['/', '/assets/index-abc.js', '/resources/logo.svg', '/missing-page', '/offline.html'])
        assert.equal(route(uri), uri, uri)
})
