'use strict'

const fs = require('node:fs')
const path = require('node:path')

// Package names are used as path segments. Only accept names npm can actually
// install, and reject anything containing traversal or extra separators before
// any path is joined.
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/i

class LicenseToolError extends Error {
    constructor(message, code = 'LICENSE_TOOL_ERROR') {
        super(message)
        this.name = 'LicenseToolError'
        this.code = code
    }
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0
}

function comparePackages(left, right) {
    return (
        compareStrings(left.name, right.name) ||
        compareStrings(left.version, right.version) ||
        compareStrings(left.license, right.license)
    )
}

function assertSafePackageName(name) {
    if (typeof name !== 'string' || name.length === 0 || name.length > 214) {
        throw new LicenseToolError('Refusing an unsafe declared dependency name.', 'UNSAFE_NAME')
    }
    if (name !== name.trim() || name.includes('\\') || name.includes('\0') || !PACKAGE_NAME_PATTERN.test(name)) {
        throw new LicenseToolError(`Refusing unsafe declared dependency name "${name}".`, 'UNSAFE_NAME')
    }
    for (const segment of name.split('/')) {
        if (segment === '' || segment === '.' || segment === '..') {
            throw new LicenseToolError(`Refusing unsafe declared dependency name "${name}".`, 'UNSAFE_NAME')
        }
    }
    return name
}

function readJsonFile(filePath, label) {
    let text
    try {
        text = fs.readFileSync(filePath, 'utf8')
    } catch {
        throw new LicenseToolError(`Unable to read ${label}.`, 'READ_ERROR')
    }
    try {
        return JSON.parse(text)
    } catch {
        throw new LicenseToolError(`${label} is not valid JSON.`, 'INVALID_JSON')
    }
}

function isInside(parent, child) {
    const relative = path.relative(parent, child)
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function* ancestorDirectories(startDirectory, rootDirectory) {
    const seen = new Set()
    const starts = [...new Set([startDirectory, rootDirectory].filter(Boolean))]

    for (const start of starts) {
        let current = path.resolve(start)
        const startsInsideRoot = isInside(rootDirectory, current)
        let guard = 0

        while (guard < 128) {
            guard += 1
            if (!seen.has(current)) {
                seen.add(current)
                yield current
            }

            if (current === rootDirectory) {
                break
            }

            const parent = path.dirname(current)
            if (parent === current) {
                break
            }

            // A package linked from inside the project should still resolve through
            // the project's hoisted node_modules, but never above the project root.
            if (startsInsideRoot && !isInside(rootDirectory, parent)) {
                break
            }

            current = parent
        }
    }
}

function findInstalledPackage(name, startDirectories, rootDirectory) {
    assertSafePackageName(name)

    const origins = []
    for (const start of startDirectories) {
        if (typeof start === 'string' && start.length > 0) {
            origins.push(start)
        }
    }
    origins.push(rootDirectory)

    const searchedDirectories = new Set()

    for (const origin of origins) {
        for (const directory of ancestorDirectories(origin, rootDirectory)) {
            if (searchedDirectories.has(directory)) {
                continue
            }
            searchedDirectories.add(directory)

            const candidate = path.join(directory, 'node_modules', name)

            let linkStat
            try {
                linkStat = fs.lstatSync(candidate)
            } catch {
                continue
            }

            if (!linkStat.isDirectory() && !linkStat.isSymbolicLink()) {
                continue
            }

            let realDirectory
            try {
                realDirectory = fs.realpathSync(candidate)
            } catch (error) {
                if (error && error.code === 'ENOENT') {
                    // A broken optional symlink is treated as not installed.
                    continue
                }
                throw new LicenseToolError(`Unable to resolve installed package "${name}" (cyclic symlink).`, 'RESOLVE_ERROR')
            }

            const packageJsonPath = path.join(realDirectory, 'package.json')
            let packageJsonStat
            try {
                packageJsonStat = fs.statSync(packageJsonPath)
            } catch {
                throw new LicenseToolError(`Installed package "${name}" has no package.json.`, 'MALFORMED_PACKAGE')
            }

            if (!packageJsonStat.isFile()) {
                throw new LicenseToolError(`Installed package "${name}" has no package.json.`, 'MALFORMED_PACKAGE')
            }

            return { realDirectory, logicalDirectory: candidate }
        }
    }

    return null
}

function readDeclaredDependencies(packageJson, { root }) {
    const entries = new Map()

    function addSection(sectionName, required, { peer = false } = {}) {
        const section = packageJson[sectionName]
        if (section === undefined) {
            return
        }
        if (!isPlainObject(section)) {
            throw new LicenseToolError(`Package field "${sectionName}" must be an object.`, 'MALFORMED_PACKAGE')
        }

        for (const name of Object.keys(section)) {
            assertSafePackageName(name)
            let entry = entries.get(name)
            if (!entry) {
                entry = { name, required: false, peer: false, dependency: false }
                entries.set(name, entry)
            }
            if (required) {
                entry.required = true
            }
            if (peer) {
                entry.peer = true
            }
            if (sectionName === 'dependencies' || sectionName === 'devDependencies') {
                entry.dependency = true
            }
        }
    }

    addSection('dependencies', true)
    if (root) {
        addSection('devDependencies', true)
        addSection('peerDependencies', true, { peer: true })

        const peerMeta = packageJson.peerDependenciesMeta
        if (peerMeta !== undefined) {
            if (!isPlainObject(peerMeta)) {
                throw new LicenseToolError('Package field "peerDependenciesMeta" must be an object.', 'MALFORMED_PACKAGE')
            }
            for (const [name, metadata] of Object.entries(peerMeta)) {
                assertSafePackageName(name)
                const entry = entries.get(name)
                if (entry?.peer && !entry.dependency && isPlainObject(metadata) && metadata.optional === true) {
                    entry.required = false
                }
            }
        }
    } else {
        // Peers of dependencies are traversed when installed, but unlike the root
        // package a missing peer is not a hard failure.
        addSection('peerDependencies', false, { peer: true })
    }

    // optionalDependencies wins over a regular dependency entry, matching npm's
    // "absence is allowed" semantics.
    addSection('optionalDependencies', false)
    const optional = packageJson.optionalDependencies
    if (isPlainObject(optional)) {
        for (const name of Object.keys(optional)) {
            const entry = entries.get(name)
            if (entry) {
                entry.required = false
            }
        }
    }

    return [...entries.values()].sort((left, right) => compareStrings(left.name, right.name))
}

function licenseReviewReason(license) {
    if (!license) {
        return 'missing'
    }
    const upper = license.toUpperCase()
    if (/(?:^|[\s()])(?:UNKNOWN|UNLICENSED|NONE|NOASSERTION)(?=$|[\s()])/.test(upper)) {
        return upper.includes('UNLICENSED') ? 'unlicensed' : 'unknown'
    }
    if (/SEE\s+LICENSE\s+IN(?:\s|$)/i.test(license)) {
        return 'see-license-file'
    }
    return null
}

function extractLicense(packageJson) {
    if (Object.hasOwn(packageJson, 'license')) {
        const raw = packageJson.license

        if (typeof raw === 'string') {
            const license = raw.trim()
            if (!license) {
                return { license: '', reviewReason: 'missing' }
            }
            return { license, reviewReason: licenseReviewReason(license) }
        }

        if (isPlainObject(raw)) {
            if (typeof raw.type === 'string' && raw.type.trim()) {
                const license = raw.type.trim()
                return { license, reviewReason: licenseReviewReason(license) }
            }
            return { license: '', reviewReason: 'malformed' }
        }

        return { license: '', reviewReason: 'malformed' }
    }

    if (Array.isArray(packageJson.licenses)) {
        if (packageJson.licenses.length === 0) {
            return { license: '', reviewReason: 'missing' }
        }

        const values = []
        let reviewReason = null
        for (const entry of packageJson.licenses) {
            let value = ''
            if (typeof entry === 'string') {
                value = entry.trim()
            } else if (isPlainObject(entry) && typeof entry.type === 'string' && entry.type.trim()) {
                value = entry.type.trim()
            }

            if (!value) {
                return { license: '', reviewReason: 'malformed' }
            }
            values.push(value)
            reviewReason = reviewReason || licenseReviewReason(value)
        }

        const unique = [...new Set(values)].sort(compareStrings)
        return { license: unique.join(' OR '), reviewReason }
    }

    return { license: '', reviewReason: 'missing' }
}

function packageIdentity(packageJson, requestedName) {
    let name = requestedName
    if (packageJson.name !== undefined) {
        if (typeof packageJson.name !== 'string' || packageJson.name.length === 0) {
            throw new LicenseToolError(`Installed package "${requestedName}" has an invalid name.`, 'MALFORMED_PACKAGE')
        }
        name = packageJson.name
    }
    assertSafePackageName(name)

    if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
        throw new LicenseToolError(`Installed package "${name}" has no valid version.`, 'MALFORMED_PACKAGE')
    }

    return { name, version: packageJson.version }
}

function buildInventory({ rootDirectory = process.cwd() } = {}) {
    const absoluteRoot = path.resolve(rootDirectory)

    let rootRealDirectory
    try {
        rootRealDirectory = fs.realpathSync(absoluteRoot)
    } catch {
        throw new LicenseToolError('Unable to read the project root directory.', 'READ_ERROR')
    }

    const rootPackageJson = readJsonFile(path.join(rootRealDirectory, 'package.json'), 'root package.json')
    if (!isPlainObject(rootPackageJson)) {
        throw new LicenseToolError('root package.json must contain an object.', 'MALFORMED_PACKAGE')
    }

    const rootName = typeof rootPackageJson.name === 'string' && rootPackageJson.name.length > 0 ? rootPackageJson.name : 'root'
    const rootVersion = typeof rootPackageJson.version === 'string' ? rootPackageJson.version : ''

    const rootDeclarations = readDeclaredDependencies(rootPackageJson, { root: true })
    const queue = rootDeclarations.map((declaration) => ({
        declaration,
        parent: { name: rootName, version: rootVersion },
        starts: [rootRealDirectory],
    }))

    const visited = new Set([rootRealDirectory])
    const packagesByNameVersion = new Map()
    const review = []
    const missing = []
    const missingKeys = new Set()

    while (queue.length > 0) {
        const { declaration, parent, starts } = queue.shift()
        const installed = findInstalledPackage(declaration.name, starts, rootRealDirectory)

        if (!installed) {
            if (declaration.required) {
                const key = `${parent.name}\0${parent.version}\0${declaration.name}`
                if (!missingKeys.has(key)) {
                    missingKeys.add(key)
                    missing.push({
                        name: declaration.name,
                        parentName: parent.name,
                        parentVersion: parent.version,
                    })
                }
            }
            continue
        }

        if (visited.has(installed.realDirectory)) {
            continue
        }
        visited.add(installed.realDirectory)

        const packageJson = readJsonFile(
            path.join(installed.realDirectory, 'package.json'),
            `package.json for installed package "${declaration.name}"`,
        )
        if (!isPlainObject(packageJson)) {
            throw new LicenseToolError(
                `Installed package "${declaration.name}" has an invalid package.json.`,
                'MALFORMED_PACKAGE',
            )
        }

        const identity = packageIdentity(packageJson, declaration.name)
        const extracted = extractLicense(packageJson)
        const record = {
            name: identity.name,
            version: identity.version,
            license: extracted.license,
        }

        const mapKey = `${record.name}\0${record.version}`
        const existing = packagesByNameVersion.get(mapKey)
        if (existing && existing.license !== record.license) {
            throw new LicenseToolError(
                `Conflicting licenses found for package "${record.name}@${record.version}".`,
                'CONFLICTING_LICENSE',
            )
        }
        packagesByNameVersion.set(mapKey, record)

        if (extracted.reviewReason) {
            review.push({
                ...record,
                reviewReason: extracted.reviewReason,
            })
        }

        const childDeclarations = readDeclaredDependencies(packageJson, {
            root: false,
        })
        const childStarts = [installed.realDirectory, installed.logicalDirectory]
        for (const child of childDeclarations) {
            queue.push({
                declaration: child,
                parent: { name: identity.name, version: identity.version },
                starts: childStarts,
            })
        }
    }

    if (missing.length > 0) {
        missing.sort(
            (left, right) =>
                compareStrings(left.parentName, right.parentName) ||
                compareStrings(left.parentVersion, right.parentVersion) ||
                compareStrings(left.name, right.name),
        )
        const lines = missing.map(
            (entry) => `  ${entry.name} (required by ${entry.parentName}${entry.parentVersion ? `@${entry.parentVersion}` : ''})`,
        )
        throw new LicenseToolError(`Missing required installed dependencies:\n${lines.join('\n')}`, 'MISSING_REQUIRED')
    }

    const packages = [...packagesByNameVersion.values()].sort(comparePackages)
    review.sort(comparePackages)

    return { packages, review }
}

module.exports = {
    LicenseToolError,
    assertSafePackageName,
    buildInventory,
    extractLicense,
}
