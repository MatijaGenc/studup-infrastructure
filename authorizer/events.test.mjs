import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'

import { authorizeToken } from './token-policy.mjs'

const { sign } = jwt
const secret = 'synthetic-authorizer-test-secret-only'
const user = {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'student',
    tokenVersion: 3,
    isAdmin: false,
}
const token = sign({ user }, secret, { expiresIn: '15m' })
const tokenEvent = JSON.parse(readFileSync(new URL('./events/token-authorizer-event.json', import.meta.url), 'utf8'))
const requestEvent = JSON.parse(readFileSync(new URL('./events/request-authorizer-event.json', import.meta.url), 'utf8'))
const effect = (result) => result.policyDocument.Statement[0].Effect
const resource = (result) => result.policyDocument.Statement[0].Resource

test('authorizes an authentic API Gateway TOKEN authorizer event', () => {
    const result = authorizeToken({ ...tokenEvent, authorizationToken: `Bearer ${token}` }, secret)
    assert.equal(effect(result), 'Allow')
    assert.equal(result.principalId, user.id)
    assert.deepEqual(result.context, { userId: user.id, userType: 'student', isAdmin: false })
})

test('authorizes an authentic API Gateway REQUEST authorizer event header', () => {
    const event = { ...requestEvent, headers: { ...requestEvent.headers, Authorization: `Bearer ${token}` } }
    const result = authorizeToken(event, secret)
    assert.equal(effect(result), 'Allow')
    assert.equal(result.principalId, user.id)
    assert.equal(result.context.userType, 'student')
})

test('validates optional numeric tokenVersion and exposes the role contract', () => {
    const employer = { ...user, type: 'employer', isAdmin: true, tokenVersion: 2 }
    const allowed = authorizeToken(
        { methodArn: tokenEvent.methodArn, authorizationToken: sign({ user: employer }, secret) },
        secret,
    )
    assert.equal(effect(allowed), 'Allow')
    assert.deepEqual(allowed.context, { userId: employer.id, userType: 'employer', isAdmin: true })
    for (const tokenVersion of ['3', null, true, {}]) {
        const result = authorizeToken(
            { methodArn: tokenEvent.methodArn, authorizationToken: sign({ user: { ...user, tokenVersion } }, secret) },
            secret,
        )
        assert.equal(effect(result), 'Deny')
    }
})

test('cached policy covers every method and path in one stage but no other stage', () => {
    const api = 'arn:aws:execute-api:eu-south-1:123456789012:example'
    const development = [`${api}/development/GET/jobs`, `${api}/development/PATCH/users/me`, `${api}/development/POST/data`].map(
        (methodArn) => resource(authorizeToken({ methodArn, authorizationToken: token }, secret)),
    )
    assert.deepEqual(new Set(development), new Set([`${api}/development/*/*`]))
    const production = resource(authorizeToken({ methodArn: `${api}/production/GET/jobs`, authorizationToken: token }, secret))
    assert.equal(production, `${api}/production/*/*`)
    assert.notEqual(production, development[0])
})

const terraform = readFileSync(new URL('../api-gateway.tf', import.meta.url), 'utf8')
function terraformResource(type, name) {
    const match = terraform.match(new RegExp(`resource "${type}" "${name}" \\{([\\s\\S]*?)\\n\\}`))
    assert.ok(match, `missing terraform resource ${type}.${name}`)
    return match[1]
}

test('private OPTIONS preflight is unauthenticated and advertises PATCH', () => {
    for (const api of ['dta_api', 'data_api']) {
        const method = terraformResource('aws_api_gateway_method', `${api}_preflight`)
        assert.match(method, /http_method\s*=\s*"OPTIONS"/)
        assert.match(method, /authorization\s*=\s*"NONE"/)
        const response = terraformResource('aws_api_gateway_integration_response', `${api}_preflight`)
        assert.match(response, /Access-Control-Allow-Methods[^\n]*PATCH/)
        assert.match(response, /Access-Control-Allow-Origin[^\n]*https:\/\/www\.studup\.net/)
        assert.match(response, /Access-Control-Allow-Credentials[^\n]*'true'/)
        for (const header of ['Content-Type', 'Authorization', 'X-Access-Token'])
            assert.match(response, new RegExp(`Access-Control-Allow-Headers[^\\n]*${header}`))
    }
})

test('gateway-generated errors carry CORS headers and deployments wait for them', () => {
    for (const api of ['dta_api', 'data_api']) {
        for (const status of ['4xx', '5xx']) {
            const response = terraformResource('aws_api_gateway_gateway_response', `${api}_default_${status}`)
            assert.match(response, /Access-Control-Allow-Origin[^\n]*https:\/\/www\.studup\.net/)
            assert.match(response, /Access-Control-Allow-Credentials[^\n]*'true'/)
            assert.match(response, /Access-Control-Allow-Methods[^\n]*PATCH/)
        }
    }
    for (const status of ['4xx', '5xx']) {
        const response = terraformResource('aws_api_gateway_gateway_response', `open_api_default_${status}`)
        assert.match(response, /Access-Control-Allow-Origin[^\n]*'\*'/)
        assert.doesNotMatch(response, /Access-Control-Allow-Credentials/)
        assert.match(response, /Access-Control-Allow-Methods[^\n]*PATCH/)
    }
    for (const api of ['dta_api', 'data_api', 'open_api']) {
        const deployment = terraformResource('aws_api_gateway_deployment', api)
        assert.match(deployment, new RegExp(`aws_api_gateway_gateway_response\\.${api}_default_4xx`))
        assert.match(deployment, new RegExp(`aws_api_gateway_gateway_response\\.${api}_default_5xx`))
    }
})

test('dta resource policy allows only HTTPS OPTIONS anonymously', () => {
    const policy = terraformResource('aws_api_gateway_rest_api_policy', 'dta_api')
    assert.match(policy, /Resource\s*=\s*"[^"]*\/\*\/OPTIONS\/\*"/)
    assert.match(policy, /aws:SecureTransport"\s*:\s*"true"/)
})
