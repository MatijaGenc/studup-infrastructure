import assert from 'node:assert/strict'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'

const { sign } = jwt

import { authorizeToken } from './token-policy.mjs'

const secret = 'synthetic-authorizer-test-secret-only'
const user = { id: '00000000-0000-4000-8000-000000000001', type: 'student' }
const methodArn = 'arn:aws:execute-api:eu-south-1:123456789012:example/default/GET/jobs'
const token = sign({ user }, secret, { expiresIn: '15m' })
const effect = (result) => result.policyDocument.Statement[0].Effect

test('reads API Gateway TOKEN events and the backend nested user', () => {
    const result = authorizeToken({ methodArn, authorizationToken: token }, secret)
    assert.equal(effect(result), 'Allow')
    assert.equal(result.principalId, user.id)
})
test('accepts Bearer tokens and legacy header events', () => {
    assert.equal(effect(authorizeToken({ methodArn, authorizationToken: `Bearer ${token}` }, secret)), 'Allow')
    assert.equal(effect(authorizeToken({ methodArn, headers: { Authorization: token } }, secret)), 'Allow')
})
test('cached policy covers methods/resources only in the same API stage', () => {
    const result = authorizeToken({ methodArn, authorizationToken: token }, secret)
    assert.equal(result.policyDocument.Statement[0].Resource, 'arn:aws:execute-api:eu-south-1:123456789012:example/default/*/*')
})
test('rejects missing, invalid, expired, wrong-secret and missing-user tokens', () => {
    for (const authorizationToken of [
        undefined,
        'invalid',
        sign({ user }, secret, { expiresIn: -1 }),
        sign({ user }, 'wrong-secret'),
        sign({ sub: user.id }, secret),
    ])
        assert.equal(effect(authorizeToken({ methodArn, authorizationToken }, secret)), 'Deny')
})
