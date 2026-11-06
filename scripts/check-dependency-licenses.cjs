#!/usr/bin/env node
'use strict'

const { LicenseToolError, buildInventory } = require('./dependency-license-inventory.cjs')
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_POLICY = 'dependency-licenses-policy.json'
// biome-ignore lint/suspicious/noControlCharactersInRegex: reject terminal control characters in dependency metadata.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/
const REVIEW = /(?:^|[\s()])(?:UNKNOWN|UNLICENSED|NONE|NOASSERTION)(?=$|[\s()])/i
const SEE = /SEE\s+LICENSE\s+IN(?:\s|$)/i
const USAGE = `Usage: node check-dependency-licenses.cjs [--policy <file>]

Checks installed dependency license metadata against an explicit policy.
This is metadata drift evidence, not legal approval. No --write or --approve.`
class LicenseCheckError extends Error {
    constructor(message, code = 'LICENSE_CHECK_ERROR') {
        super(message)
        this.name = 'LicenseCheckError'
        this.code = code
    }
}
function fail(message, code) {
    throw new LicenseCheckError(message, code)
}
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function safeText(value) {
    return typeof value === 'string' && value.length > 0 && !CONTROL.test(value)
}
function safeLicense(value) {
    return typeof value === 'string' && !CONTROL.test(value)
}
function safeName(value) {
    return (
        safeText(value) &&
        value === value.trim() &&
        !value.includes('\\') &&
        /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/i.test(value) &&
        value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
    )
}
function safeVersion(value) {
    return safeText(value) && value === value.trim()
}
function reviewReasonFor(license) {
    if (license.length === 0) return 'missing'
    if (REVIEW.test(license)) return /UNLICENSED/i.test(license) ? 'unlicensed' : 'unknown'
    if (SEE.test(license)) return 'see-license-file'
    return /(?:LGPL|EPL|MPL|FSL|CC-BY)/i.test(license) ? 'license-obligations-review' : null
}
function identityKey(entry) {
    return `${entry.name}\0${entry.version}`
}
function observationKey(entry) {
    return `${identityKey(entry)}\0${entry.license}`
}
function validatePolicy(policy) {
    if (policy?.schemaVersion !== 1) {
        fail('Unsupported dependency license policy schema.', 'INVALID_POLICY')
    }
    if (!isObject(policy)) fail('Dependency license policy must be a JSON object.', 'INVALID_POLICY')
    const raw = policy.recordedLicenseExpressions
    if (!Array.isArray(raw)) fail('Dependency license policy must contain a recordedLicenseExpressions array.', 'INVALID_POLICY')
    const expressions = []
    for (const expression of raw) {
        if (!safeText(expression) || expression !== expression.trim())
            fail('Dependency license policy contains a malformed license expression.', 'INVALID_POLICY')
        if (expressions.length && !(expressions[expressions.length - 1] < expression))
            fail('Dependency license policy expressions must be sorted and unique.', 'INVALID_POLICY')
        expressions.push(expression)
    }
    const rawItems = policy.existingReviewItems === undefined ? [] : policy.existingReviewItems
    if (!Array.isArray(rawItems)) fail('Dependency license policy existingReviewItems must be an array.', 'INVALID_POLICY')
    const identities = new Set()
    const items = rawItems.map((item) => {
        if (
            !isObject(item) ||
            !safeName(item.name) ||
            !safeVersion(item.version) ||
            !safeLicense(item.license) ||
            !safeText(item.note) ||
            !safeText(item.reason) ||
            item.reason !== item.reason.trim() ||
            item.status !== 'unresolved'
        ) {
            fail('Dependency license policy contains a malformed existing review item.', 'INVALID_POLICY')
        }
        if (identities.has(identityKey(item)))
            fail('Dependency license policy contains duplicate review identities.', 'INVALID_POLICY')
        identities.add(identityKey(item))
        return { name: item.name, version: item.version, license: item.license, reason: item.reason, note: item.note }
    })
    return {
        expressionList: expressions,
        expressions: new Set(expressions),
        reviewByKey: new Map(items.map((item) => [identityKey(item), item])),
    }
}

function validateInventory(inventory) {
    if (!isObject(inventory) || !Array.isArray(inventory.packages))
        fail('Dependency inventory must contain a packages array.', 'INVALID_INVENTORY')
    const packages = inventory.packages.map((entry) => {
        if (!isObject(entry) || !safeName(entry.name) || !safeVersion(entry.version) || !safeLicense(entry.license))
            fail('Dependency inventory contains a malformed package identity.', 'INVALID_INVENTORY')
        return { name: entry.name, version: entry.version, license: entry.license }
    })
    const reviewReasons = new Map()
    if (inventory.review !== undefined) {
        if (!Array.isArray(inventory.review))
            fail('Dependency inventory review observations must be an array.', 'INVALID_INVENTORY')
        for (const entry of inventory.review) {
            if (
                !isObject(entry) ||
                !safeName(entry.name) ||
                !safeVersion(entry.version) ||
                !safeLicense(entry.license) ||
                !safeText(entry.reviewReason)
            )
                fail('Dependency inventory contains a malformed review observation.', 'INVALID_INVENTORY')
            reviewReasons.set(observationKey(entry), entry.reviewReason)
        }
    }
    return { packages, reviewReasons }
}
// Pure: validates observed expressions and exact unresolved observations only.
// It does not compare the installed package set or versions; the frozen lockfile
// gate owns the dependency graph.
function checkInventory(inventory, policy) {
    const observed = validateInventory(inventory)
    const rules = validatePolicy(policy)
    const warnings = []
    const failures = []
    const expressions = new Set()
    for (const entry of observed.packages) {
        const reason = observed.reviewReasons.get(observationKey(entry)) || reviewReasonFor(entry.license)
        if (reason) {
            const record = {
                code: 'unresolved-license-observation',
                name: entry.name,
                version: entry.version,
                license: entry.license,
                reason,
            }
            const existing = rules.reviewByKey.get(identityKey(entry))
            if (existing && existing.license === entry.license && existing.reason === reason)
                warnings.push({ ...record, code: 'existing-unresolved-license', note: existing.note })
            else failures.push(record)
        } else {
            expressions.add(entry.license)
            if (!rules.expressions.has(entry.license))
                failures.push({
                    code: 'unrecorded-license-expression',
                    name: entry.name,
                    version: entry.version,
                    license: entry.license,
                })
        }
    }
    return {
        ok: failures.length === 0,
        packagesChecked: observed.packages.length,
        recordedExpressions: rules.expressionList.length,
        unresolvedObservations: warnings.length + failures.filter((failure) => failure.reason).length,
        observedExpressions: [...expressions].sort(),
        warnings,
        failures,
    }
}
function readPolicy(filePath) {
    let text
    try {
        text = fs.readFileSync(filePath, 'utf8')
    } catch {
        fail('Unable to read the dependency license policy.', 'READ_POLICY')
    }
    try {
        return JSON.parse(text)
    } catch {
        fail('Dependency license policy is not valid JSON.', 'INVALID_POLICY')
    }
}

function parseArguments(argv) {
    const options = { policyFile: DEFAULT_POLICY, help: false }
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index]
        if (argument === '--help' || argument === '-h') options.help = true
        else if (argument === '--policy') {
            if (!argv[index + 1]) fail('--policy requires a file path.', 'USAGE')
            options.policyFile = argv[index + 1]
            index += 1
        } else if (argument.startsWith('--policy=')) {
            const value = argument.slice('--policy='.length)
            if (!value) fail('--policy requires a file path.', 'USAGE')
            options.policyFile = value
        } else fail('Unknown command-line argument.', 'USAGE')
    }
    return options
}

function sanitize(text) {
    return String(text).replace(new RegExp(CONTROL.source, 'g'), ' ').slice(0, 1000)
}
function printObservation(stream, label, entry) {
    stream.write(`${label} ${JSON.stringify(entry)}\n`)
}
function run(argv, streams) {
    const options = parseArguments(argv)
    if (options.help) {
        streams.stdout.write(`${USAGE}\n`)
        return 0
    }
    const policy = readPolicy(path.resolve(process.cwd(), options.policyFile))
    const inventory = buildInventory({ rootDirectory: process.cwd() })
    const result = checkInventory(inventory, policy)
    streams.stdout.write('Dependency license metadata check (drift evidence only; not legal approval).\n')
    streams.stdout.write(`Packages checked: ${result.packagesChecked}\n`)
    streams.stdout.write(`Recorded license expressions: ${result.recordedExpressions}\n`)
    streams.stdout.write(`Unresolved observations: ${result.unresolvedObservations}\n`)
    for (const warning of result.warnings) printObservation(streams.stderr, 'WARNING', warning)
    for (const failure of result.failures) printObservation(streams.stderr, 'FAIL', failure)
    if (!result.ok) {
        streams.stderr.write(
            `Dependency license metadata check failed: ${result.failures.length} new drift finding(s). Legal review pending is not approval.\n`,
        )
        return 1
    }
    streams.stdout.write(
        'Dependency license metadata check passed. Legal review remains pending for tracked unresolved observations.\n',
    )
    return 0
}

function main(argv = process.argv.slice(2)) {
    try {
        return run(argv, { stdout: process.stdout, stderr: process.stderr })
    } catch (error) {
        if (error instanceof LicenseToolError)
            process.stderr.write(`license-check: dependency inventory could not be built: ${sanitize(error.message)}\n`)
        else if (error instanceof LicenseCheckError) {
            process.stderr.write(`license-check: ${error.message}\n`)
            if (error.code === 'USAGE') process.stderr.write(`${USAGE}\n`)
        } else process.stderr.write('license-check: dependency license metadata check could not run.\n')
        return 1
    }
}

module.exports = { DEFAULT_POLICY, LicenseCheckError, checkInventory, main, parseArguments, reviewReasonFor, run }

if (require.main === module) process.exitCode = main()
