'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { assertSafePackageName, buildInventory, extractLicense } = require('./dependency-license-inventory.cjs')

function makeProject(t, name = 'dependency-license-inventory-') {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), name))
    t.after(() => {
        fs.rmSync(directory, { recursive: true, force: true })
    })
    return directory
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeRootPackage(project, packageJson) {
    writeJson(path.join(project, 'package.json'), packageJson)
}

function addPackage(project, installPath, packageJson) {
    writeJson(path.join(project, 'node_modules', installPath, 'package.json'), packageJson)
}

function addPackageAt(directory, packageJson) {
    writeJson(path.join(directory, 'package.json'), packageJson)
}

function linkPackage(project, installPath, targetPath) {
    fs.mkdirSync(path.dirname(path.join(project, 'node_modules', installPath)), {
        recursive: true,
    })
    fs.symlinkSync(targetPath, path.join(project, 'node_modules', installPath), 'dir')
}

function byName(packages) {
    return new Map(packages.map((entry) => [entry.name, entry]))
}

test('inventories root, nested, scoped, exports-blocked, symlinked and private packages', (t) => {
    const project = makeProject(t)

    writeRootPackage(project, {
        name: 'fixture-root',
        version: '9.9.9',
        private: true,
        license: 'UNLICENSED',
        dependencies: {
            alpha: '1.0.0',
            '@scope/scoped': '2.0.0',
            linked: '1.0.0',
            'exports-blocked': '3.0.0',
            'private-dep': '1.0.0',
            'optional-present': '1.0.0',
            'optional-missing': '1.0.0',
        },
        devDependencies: {
            'dev-only': '1.0.0',
        },
        peerDependencies: {
            'peer-installed': '1.0.0',
            'peer-optional': '1.0.0',
        },
        peerDependenciesMeta: {
            'peer-optional': { optional: true },
        },
        optionalDependencies: {
            'optional-present': '1.0.0',
            'optional-missing': '1.0.0',
        },
    })

    addPackage(project, 'alpha', {
        name: 'alpha',
        version: '1.0.0',
        license: 'MIT',
        dependencies: { nested: '1.0.0' },
        optionalDependencies: { 'alpha-optional-missing': '1.0.0' },
        peerDependencies: {
            'alpha-peer': '1.0.0',
            'alpha-missing-peer': '1.0.0',
        },
        devDependencies: { 'ignored-dev': '1.0.0' },
    })
    addPackage(project, 'alpha/node_modules/nested', {
        name: 'nested',
        version: '1.0.0',
        license: 'Apache-2.0',
        dependencies: { alpha: '1.0.0' },
    })
    addPackage(project, 'alpha/node_modules/ignored-dev', {
        name: 'ignored-dev',
        version: '1.0.0',
        license: 'UNLICENSED',
    })
    addPackage(project, 'alpha-peer', {
        name: 'alpha-peer',
        version: '1.0.0',
        license: 'BSD-3-Clause',
    })

    addPackage(project, '@scope/scoped', {
        name: '@scope/scoped',
        version: '2.0.0',
        license: 'Apache-2.0',
        dependencies: { '@scope/inner': '1.0.0' },
    })
    addPackage(project, '@scope/inner', {
        name: '@scope/inner',
        version: '1.0.0',
        license: 'MIT',
    })

    const linkedTarget = path.join(project, 'packages', 'linked-target')
    writeRootPackage(linkedTarget, {
        name: 'linked',
        version: '1.0.0',
        license: 'BSD-3-Clause',
        dependencies: { 'linked-nested': '1.0.0' },
    })
    addPackageAt(path.join(linkedTarget, 'node_modules', 'linked-nested'), {
        name: 'linked-nested',
        version: '1.0.0',
        license: 'Zlib',
    })
    linkPackage(project, 'linked', linkedTarget)

    addPackage(project, 'exports-blocked', {
        name: 'exports-blocked',
        version: '3.0.0',
        license: 'MIT',
        exports: { '.': './index.js' },
    })
    fs.writeFileSync(path.join(project, 'node_modules', 'exports-blocked', 'index.js'), 'module.exports = 1;\n', 'utf8')

    addPackage(project, 'private-dep', {
        name: 'private-dep',
        version: '1.0.0',
        private: true,
        licenses: [{ type: 'MIT' }, { type: 'ISC' }],
    })
    addPackage(project, 'dev-only', {
        name: 'dev-only',
        version: '1.0.0',
        license: '0BSD',
    })
    addPackage(project, 'peer-installed', {
        name: 'peer-installed',
        version: '1.0.0',
        license: 'MPL-2.0',
    })
    addPackage(project, 'optional-present', {
        name: 'optional-present',
        version: '1.0.0',
        license: 'CC0-1.0',
    })

    const inventory = buildInventory({ rootDirectory: project })
    const names = inventory.packages.map((entry) => entry.name)
    const packages = byName(inventory.packages)

    assert.ok(!names.includes('fixture-root'), 'private root must not be inventoried')
    assert.ok(!names.includes('ignored-dev'), 'dependency devDependencies are not traversed')
    assert.ok(!names.includes('alpha-missing-peer'), 'missing non-root peers are skipped')
    assert.ok(!names.includes('alpha-optional-missing'), 'missing nested optional dependencies are skipped')
    assert.ok(!names.includes('optional-missing'), 'missing root optional dependencies are skipped')
    assert.ok(!names.includes('peer-optional'), 'missing optional root peers are skipped')

    assert.ok(names.includes('private-dep'), 'private dependencies are still inventoried')
    assert.equal(packages.get('private-dep').license, 'ISC OR MIT')
    assert.equal(packages.get('linked').version, '1.0.0')
    assert.equal(packages.get('linked-nested').license, 'Zlib')
    assert.equal(packages.get('alpha-peer').license, 'BSD-3-Clause')
    assert.equal(packages.get('@scope/inner').license, 'MIT')
    assert.equal(packages.get('exports-blocked').license, 'MIT')
    assert.equal(packages.get('nested').license, 'Apache-2.0')
    assert.equal(packages.get('dev-only').license, '0BSD')
    assert.equal(packages.get('peer-installed').license, 'MPL-2.0')
    assert.equal(packages.get('optional-present').license, 'CC0-1.0')

    assert.deepEqual(inventory.review, [])
    assert.deepEqual(
        inventory.packages,
        [...inventory.packages].sort((left, right) => {
            if (left.name !== right.name) return left.name < right.name ? -1 : 1
            if (left.version !== right.version) return left.version < right.version ? -1 : 1
            if (left.license !== right.license) return left.license < right.license ? -1 : 1
            return 0
        }),
    )
})

test('resolves pnpm-style virtual-store symlinks', (t) => {
    const project = makeProject(t)
    writeRootPackage(project, {
        name: 'root',
        version: '1.0.0',
        private: true,
        dependencies: { foo: '1.0.0' },
    })

    const store = path.join(project, 'node_modules', '.pnpm')
    const fooDirectory = path.join(store, 'foo@1.0.0', 'node_modules', 'foo')
    const barDirectory = path.join(store, 'bar@2.0.0', 'node_modules', 'bar')
    addPackageAt(fooDirectory, {
        name: 'foo',
        version: '1.0.0',
        license: 'MIT',
        dependencies: { bar: '2.0.0' },
    })
    addPackageAt(barDirectory, {
        name: 'bar',
        version: '2.0.0',
        license: 'ISC',
    })

    fs.symlinkSync(barDirectory, path.join(store, 'foo@1.0.0', 'node_modules', 'bar'), 'dir')
    fs.mkdirSync(path.join(project, 'node_modules'), { recursive: true })
    fs.symlinkSync(fooDirectory, path.join(project, 'node_modules', 'foo'), 'dir')

    assert.deepEqual(buildInventory({ rootDirectory: project }).packages, [
        { name: 'bar', version: '2.0.0', license: 'ISC' },
        { name: 'foo', version: '1.0.0', license: 'MIT' },
    ])
})

test('fails on missing required dependencies and required root peers but skips optional ones', async (parentTest) => {
    await parentTest.test('missing root dependency', (t) => {
        const project = makeProject(t)
        writeRootPackage(project, {
            name: 'root',
            version: '1.0.0',
            private: true,
            dependencies: { 'missing-dep': '1.0.0' },
        })

        assert.throws(
            () => buildInventory({ rootDirectory: project }),
            (error) => {
                assert.equal(error.code, 'MISSING_REQUIRED')
                assert.match(error.message, /missing-dep/)
                return true
            },
        )
    })

    await parentTest.test('missing nested dependency names its parent', (t) => {
        const project = makeProject(t)
        writeRootPackage(project, {
            name: 'root',
            version: '1.0.0',
            private: true,
            dependencies: { parent: '1.0.0' },
        })
        addPackage(project, 'parent', {
            name: 'parent',
            version: '2.3.4',
            license: 'MIT',
            dependencies: { 'nested-missing': '1.0.0' },
        })

        assert.throws(
            () => buildInventory({ rootDirectory: project }),
            (error) => {
                assert.equal(error.code, 'MISSING_REQUIRED')
                assert.match(error.message, /nested-missing \(required by parent@2\.3\.4\)/)
                return true
            },
        )
    })

    await parentTest.test('missing required root peer', (t) => {
        const project = makeProject(t)
        writeRootPackage(project, {
            name: 'root',
            version: '1.0.0',
            private: true,
            peerDependencies: { 'root-peer': '1.0.0' },
        })

        assert.throws(
            () => buildInventory({ rootDirectory: project }),
            (error) => {
                assert.equal(error.code, 'MISSING_REQUIRED')
                assert.match(error.message, /root-peer/)
                return true
            },
        )
    })

    await parentTest.test('missing optional dependencies and optional peers are skipped', (t) => {
        const project = makeProject(t)
        writeRootPackage(project, {
            name: 'root',
            version: '1.0.0',
            private: true,
            dependencies: { 'optional-dep': '1.0.0' },
            optionalDependencies: { 'optional-dep': '1.0.0' },
            peerDependencies: { 'optional-peer': '1.0.0' },
            peerDependenciesMeta: { 'optional-peer': { optional: true } },
        })

        assert.deepEqual(buildInventory({ rootDirectory: project }).packages, [])
    })
})

test('parses malformed and unknown legacy license fields without approving them', () => {
    assert.deepEqual(extractLicense({ license: 'MIT' }), {
        license: 'MIT',
        reviewReason: null,
    })
    assert.deepEqual(extractLicense({ license: { type: 'Apache-2.0', url: 'x' } }), {
        license: 'Apache-2.0',
        reviewReason: null,
    })
    assert.deepEqual(extractLicense({ licenses: ['MIT', 'Apache-2.0', 'MIT'] }), {
        license: 'Apache-2.0 OR MIT',
        reviewReason: null,
    })
    assert.deepEqual(extractLicense({ licenses: [{ type: 'ISC' }] }), {
        license: 'ISC',
        reviewReason: null,
    })
    assert.equal(extractLicense({ license: 'UNKNOWN' }).reviewReason, 'unknown')
    assert.equal(extractLicense({ license: 'UNLICENSED' }).reviewReason, 'unlicensed')
    assert.equal(extractLicense({ license: 'SEE LICENSE IN COPYING' }).reviewReason, 'see-license-file')
    assert.equal(extractLicense({}).reviewReason, 'missing')
    assert.equal(extractLicense({ license: 42 }).reviewReason, 'malformed')
    assert.equal(extractLicense({ licenses: [{ url: 'no-type' }] }).reviewReason, 'malformed')
    assert.equal(extractLicense({ licenses: [{ type: 'MIT' }, { type: 'UNKNOWN' }] }).reviewReason, 'unknown')
    assert.equal(extractLicense({ licenses: [] }).reviewReason, 'missing')
})

test('rejects malicious declared dependency names before any path join', (t) => {
    assert.equal(assertSafePackageName('@scope/pkg-name'), '@scope/pkg-name')
    assert.equal(assertSafePackageName('a.b-c_d~e'), 'a.b-c_d~e')

    for (const name of ['', '.', '..', '../escape', '@scope/../x', 'a/b', 'a\\b', ' a', '%2e%2e']) {
        assert.throws(
            () => assertSafePackageName(name),
            (error) => error.code === 'UNSAFE_NAME',
        )
    }

    const project = makeProject(t)
    writeRootPackage(project, {
        name: 'root',
        version: '1.0.0',
        private: true,
        dependencies: { '../escape': '1.0.0' },
    })

    assert.throws(
        () => buildInventory({ rootDirectory: project }),
        (error) => error.code === 'UNSAFE_NAME',
    )
    assert.equal(fs.existsSync(path.join(project, 'escape')), false)
})

test('fails when the same package identity has conflicting licenses', (t) => {
    const project = makeProject(t)
    writeRootPackage(project, {
        name: 'root',
        version: '1.0.0',
        private: true,
        dependencies: { a: '1.0.0', b: '1.0.0' },
    })
    addPackage(project, 'a', {
        name: 'a',
        version: '1.0.0',
        license: 'MIT',
        dependencies: { shared: '1.0.0' },
    })
    addPackage(project, 'b', {
        name: 'b',
        version: '1.0.0',
        license: 'MIT',
        dependencies: { shared: '1.0.0' },
    })
    addPackage(project, 'a/node_modules/shared', {
        name: 'shared',
        version: '1.0.0',
        license: 'MIT',
    })
    addPackage(project, 'b/node_modules/shared', {
        name: 'shared',
        version: '1.0.0',
        license: 'Apache-2.0',
    })

    assert.throws(
        () => buildInventory({ rootDirectory: project }),
        (error) => {
            assert.equal(error.code, 'CONFLICTING_LICENSE')
            assert.match(error.message, /shared@1\.0\.0/)
            return true
        },
    )
})

test('terminates on dependency cycles', (t) => {
    const project = makeProject(t)
    writeRootPackage(project, {
        name: 'root',
        version: '1.0.0',
        private: true,
        dependencies: { alpha: '1.0.0' },
    })
    addPackage(project, 'alpha', {
        name: 'alpha',
        version: '1.0.0',
        license: 'MIT',
        dependencies: { beta: '1.0.0' },
    })
    addPackage(project, 'beta', {
        name: 'beta',
        version: '1.0.0',
        license: 'ISC',
        dependencies: { alpha: '1.0.0' },
    })

    assert.deepEqual(buildInventory({ rootDirectory: project }).packages, [
        { name: 'alpha', version: '1.0.0', license: 'MIT' },
        { name: 'beta', version: '1.0.0', license: 'ISC' },
    ])
})
