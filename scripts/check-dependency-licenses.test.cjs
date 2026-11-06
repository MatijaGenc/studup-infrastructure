'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { DEFAULT_POLICY, LicenseCheckError, checkInventory, parseArguments } = require('./check-dependency-licenses.cjs')

function pkg(name, version, license) {
    return { name, version, license }
}
function observation(name, version, license, reviewReason) {
    return { ...pkg(name, version, license), reviewReason }
}
function reviewItem(name, version, license, reason, status = 'unresolved') {
    return { name, version, license, reason, status, note: 'Existing metadata finding; resolution remains pending.' }
}
function inventory(packages, review = []) {
    return { packages, review }
}
function policy(recordedLicenseExpressions, existingReviewItems = []) {
    return { schemaVersion: 1, recordedLicenseExpressions, existingReviewItems }
}

test('platform package name changes with the same expression pass', () => {
    const rules = policy(['MIT'])
    for (const name of ['darwin-only', 'linux-only']) {
        const result = checkInventory(inventory([pkg(name, '1.0.0', 'MIT')]), rules)
        assert.equal(result.ok, true)
        assert.deepEqual(result.failures, [])
        assert.deepEqual(result.warnings, [])
    }
})

test('an unrecorded expression fails without normalization', () => {
    const rules = policy(['MIT'])
    for (const license of ['Apache-2.0', 'mit', 'MIT OR Apache-2.0']) {
        const result = checkInventory(inventory([pkg('dep', '1.0.0', license)]), rules)
        assert.equal(result.ok, false)
        assert.equal(result.failures.length, 1)
        assert.equal(result.failures[0].code, 'unrecorded-license-expression')
        assert.equal(result.failures[0].license, license)
    }
})

test('new unknown observations and new versions fail', () => {
    const tracked = reviewItem('tracked', '1.0.0', 'UNKNOWN', 'unknown')
    const rules = policy(['MIT'], [tracked])

    const newName = checkInventory(inventory([pkg('new-dep', '1.0.0', 'UNKNOWN')]), rules)
    assert.equal(newName.ok, false)
    assert.equal(newName.failures[0].code, 'unresolved-license-observation')
    assert.equal(newName.failures[0].reason, 'unknown')

    const newVersion = checkInventory(inventory([pkg('tracked', '2.0.0', 'UNKNOWN')]), rules)
    assert.equal(newVersion.ok, false)
    assert.equal(newVersion.failures[0].version, '2.0.0')
})

test('an exact existing unresolved finding warns on every run', () => {
    const tracked = reviewItem('tracked', '1.0.0', 'UNKNOWN', 'unknown')
    const observed = inventory([pkg('tracked', '1.0.0', 'UNKNOWN')], [observation('tracked', '1.0.0', 'UNKNOWN', 'unknown')])
    for (let run = 0; run < 2; run += 1) {
        const result = checkInventory(observed, policy(['MIT'], [tracked]))
        assert.equal(result.ok, true)
        assert.equal(result.failures.length, 0)
        assert.deepEqual(result.warnings, [
            {
                code: 'existing-unresolved-license',
                note: 'Existing metadata finding; resolution remains pending.',
                name: 'tracked',
                version: '1.0.0',
                license: 'UNKNOWN',
                reason: 'unknown',
            },
        ])
    }
})

test('missing and malformed observations need the exact recorded reason', () => {
    const missing = checkInventory(inventory([pkg('dep', '1.0.0', '')]), policy([]))
    assert.equal(missing.ok, false)
    assert.equal(missing.failures[0].reason, 'missing')

    const observed = inventory([pkg('dep', '1.0.0', '')], [observation('dep', '1.0.0', '', 'malformed')])
    const wrong = checkInventory(observed, policy([], [reviewItem('dep', '1.0.0', '', 'missing')]))
    assert.equal(wrong.ok, false)
    assert.equal(wrong.failures[0].reason, 'malformed')

    const right = checkInventory(observed, policy([], [reviewItem('dep', '1.0.0', '', 'malformed')]))
    assert.equal(right.ok, true)
    assert.equal(right.warnings[0].reason, 'malformed')
})

test('an existing review item never covers a different license or reason', () => {
    const tracked = reviewItem('dep', '1.0.0', 'UNKNOWN', 'unknown')
    const result = checkInventory(inventory([pkg('dep', '1.0.0', 'UNLICENSED')]), policy([], [tracked]))
    assert.equal(result.ok, false)
    assert.equal(result.failures[0].reason, 'unlicensed')
})

test('review markers cannot be approved through the expression list', () => {
    const rules = policy(['MIT', 'NONE', 'SEE LICENSE IN LICENSE.txt', 'UNKNOWN', 'UNLICENSED'])
    const cases = [
        ['NONE', 'unknown'],
        ['SEE LICENSE IN LICENSE.txt', 'see-license-file'],
        ['UNKNOWN', 'unknown'],
        ['UNLICENSED', 'unlicensed'],
    ]
    for (const [license, reason] of cases) {
        const result = checkInventory(inventory([pkg('dep', '1.0.0', license)]), rules)
        assert.equal(result.ok, false)
        assert.equal(result.failures[0].reason, reason)
    }
})

test('malformed, unsorted, and duplicate policy data fail safely', () => {
    const observed = inventory([pkg('dep', '1.0.0', 'MIT')])
    const badPolicies = [
        undefined,
        null,
        {},
        { recordedLicenseExpressions: 'MIT' },
        { recordedLicenseExpressions: ['MIT', 'MIT'] },
        { recordedLicenseExpressions: ['MIT', 'Apache-2.0'] },
        { recordedLicenseExpressions: [' MIT'] },
        { recordedLicenseExpressions: ['MIT\n'] },
        { recordedLicenseExpressions: ['MIT'], existingReviewItems: {} },
        {
            recordedLicenseExpressions: ['MIT'],
            existingReviewItems: [reviewItem('dep', '1.0.0', 'UNKNOWN', 'unknown', 'approved')],
        },
        {
            recordedLicenseExpressions: ['MIT'],
            existingReviewItems: [reviewItem('dep', '1.0.0', 'UNKNOWN', '')],
        },
        {
            recordedLicenseExpressions: ['MIT'],
            existingReviewItems: [
                reviewItem('dep', '1.0.0', 'UNKNOWN', 'unknown'),
                reviewItem('dep', '1.0.0', 'NONE', 'unknown'),
            ],
        },
    ]
    for (const value of badPolicies) {
        assert.throws(
            () => checkInventory(observed, value && typeof value === 'object' ? { schemaVersion: 1, ...value } : value),
            LicenseCheckError,
        )
    }
})

test('malformed inventory identities and control characters fail safely', () => {
    const rules = policy(['MIT'])
    const badInventories = [
        null,
        {},
        { packages: 'no' },
        { packages: [{ name: 'dep', version: '1.0.0' }] },
        { packages: [pkg('dep\u0000bad', '1.0.0', 'MIT')] },
        { packages: [pkg('dep', '1.0.0\n', 'MIT')] },
        { packages: [pkg('dep', '1.0.0', 'MIT\n')] },
        { packages: [], review: {} },
        { packages: [], review: [observation('dep', '1.0.0', 'MIT', 'unknown\u0007')] },
    ]
    for (const value of badInventories) {
        assert.throws(
            () => checkInventory(value, rules),
            (error) => {
                assert.ok(error instanceof LicenseCheckError)
                assert.ok(!error.message.includes('\u0000'))
                assert.ok(!error.message.includes('\n'))
                return true
            },
        )
    }
})

test('expression policy does not require an exact installed package set', () => {
    const result = checkInventory(inventory([pkg('only-platform-package', '9.9.9', 'MIT')]), policy(['Apache-2.0', 'MIT']))
    assert.equal(result.ok, true)
    assert.deepEqual(result.observedExpressions, ['MIT'])
})

test('acknowledged findings warn while any new finding still fails', () => {
    const tracked = reviewItem('tracked', '1.0.0', 'UNKNOWN', 'unknown')
    const result = checkInventory(
        inventory(
            [pkg('tracked', '1.0.0', 'UNKNOWN'), pkg('new', '1.0.0', 'NONE')],
            [observation('tracked', '1.0.0', 'UNKNOWN', 'unknown')],
        ),
        policy(['MIT'], [tracked]),
    )
    assert.equal(result.ok, false)
    assert.equal(result.warnings.length, 1)
    assert.equal(result.failures.length, 1)
    assert.equal(result.failures[0].reason, 'unknown')
    assert.equal(result.unresolvedObservations, 2)
})

test('CLI has no write or approve mode', () => {
    assert.throws(() => parseArguments(['--write']), LicenseCheckError)
    assert.throws(() => parseArguments(['--approve']), LicenseCheckError)
    assert.deepEqual(parseArguments([]), {
        policyFile: DEFAULT_POLICY,
        help: false,
    })
})

test('conditional declarations need explicit ongoing review and version changes fail', () => {
    const item = reviewItem('conditional', '1.0.0', 'LGPL-3.0-or-later', 'license-obligations-review')
    assert.equal(
        checkInventory(inventory([pkg('conditional', '1.0.0', 'LGPL-3.0-or-later')]), policy(['LGPL-3.0-or-later'])).ok,
        false,
    )
    const old = checkInventory(
        inventory([pkg('conditional', '1.0.0', 'LGPL-3.0-or-later')]),
        policy(['LGPL-3.0-or-later'], [item]),
    )
    assert.equal(old.ok, true)
    assert.equal(old.warnings.length, 1)
    assert.equal(
        checkInventory(inventory([pkg('conditional', '2.0.0', 'LGPL-3.0-or-later')]), policy(['LGPL-3.0-or-later'], [item])).ok,
        false,
    )
})

test('unsupported policy schemas fail closed', () => {
    assert.throws(() => checkInventory(inventory([]), { schemaVersion: 2, recordedLicenseExpressions: [] }), LicenseCheckError)
})
