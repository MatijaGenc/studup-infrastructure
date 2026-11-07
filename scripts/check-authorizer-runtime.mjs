import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = new URL('..', import.meta.url).pathname
const archive = join(root, 'authorizer.zip')
const eventsDirectory = join(root, 'authorizer/events')
const secret = 'synthetic-authorizer-package-secret-only'
const user = {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'student',
    tokenVersion: 3,
    isAdmin: false,
}

function base64url(value) {
    return Buffer.from(value).toString('base64url')
}

function signToken(claims) {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = base64url(JSON.stringify(claims))
    const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
    return `${header}.${payload}.${signature}`
}

function effect(result) {
    return result.policyDocument.Statement[0].Effect
}

async function main() {
    const stage = mkdtempSync(join(tmpdir(), 'studup-authorizer-runtime-'))
    const stubState = { fail: false }
    const stub = createServer((request, response) => {
        request.resume()
        request.on('end', () => {
            if (stubState.fail) {
                response.writeHead(500, { 'content-type': 'application/x-amz-json-1.1' })
                response.end(JSON.stringify({ __type: 'InternalServiceError' }))
                return
            }
            response.writeHead(200, { 'content-type': 'application/x-amz-json-1.1' })
            response.end(
                JSON.stringify({
                    ARN: 'arn:aws:secretsmanager:eu-south-1:123456789012:secret:studup-jwt-secret',
                    Name: 'studup-jwt-secret',
                    SecretString: secret,
                }),
            )
        })
    })

    try {
        execFileSync('unzip', ['-q', archive, '-d', stage], { stdio: 'inherit' })
        for (const required of ['index.mjs', 'token-policy.mjs', 'node_modules/jsonwebtoken/package.json']) {
            readFileSync(join(stage, required))
        }
        assert.throws(() => readFileSync(join(stage, 'node_modules/typescript/package.json')))
        assert.throws(() => readFileSync(join(stage, 'index.ts')))

        await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve))
        const address = stub.address()
        if (!address || typeof address === 'string') {
            throw new Error('Could not bind the Secrets Manager stub')
        }

        Object.assign(process.env, {
            AWS_ACCESS_KEY_ID: 'synthetic-authorizer-runtime',
            AWS_ENDPOINT_URL: `http://127.0.0.1:${address.port}`,
            AWS_ENDPOINT_URL_SECRETS_MANAGER: `http://127.0.0.1:${address.port}`,
            AWS_MAX_ATTEMPTS: '1',
            AWS_REGION: 'eu-south-1',
            AWS_SECRET_ACCESS_KEY: 'synthetic-authorizer-runtime',
        })

        const tokenEvent = JSON.parse(readFileSync(join(eventsDirectory, 'token-authorizer-event.json'), 'utf8'))
        const requestEvent = JSON.parse(readFileSync(join(eventsDirectory, 'request-authorizer-event.json'), 'utf8'))
        const token = signToken({ exp: Math.floor(Date.now() / 1000) + 300, user })

        const { handler } = await import(`${pathToFileURL(join(stage, 'index.mjs')).href}?runtime=${Date.now()}`)

        const tokenResult = await handler({ ...tokenEvent, authorizationToken: `Bearer ${token}` })
        assert.equal(effect(tokenResult), 'Allow')
        assert.equal(tokenResult.principalId, user.id)
        assert.deepEqual(tokenResult.context, { userId: user.id, userType: 'student', isAdmin: false })

        const requestResult = await handler({
            ...requestEvent,
            headers: { ...requestEvent.headers, Authorization: `Bearer ${token}` },
        })
        assert.equal(effect(requestResult), 'Allow')
        assert.equal(requestResult.principalId, user.id)

        const invalidResult = await handler({ ...tokenEvent, authorizationToken: 'Bearer invalid' })
        assert.equal(effect(invalidResult), 'Deny')

        // A warm execution environment keeps serving the cached secret through a provider outage.
        stubState.fail = true
        const warmResult = await handler({ ...tokenEvent, authorizationToken: `Bearer ${token}` })
        assert.equal(effect(warmResult), 'Allow')

        // A cold instance fails closed instead of authorizing with an empty secret.
        const cold = await import(`${pathToFileURL(join(stage, 'index.mjs')).href}?cold=${Date.now()}`)
        const coldResult = await cold.handler({ ...tokenEvent, authorizationToken: `Bearer ${token}` })
        assert.equal(effect(coldResult), 'Deny')

        process.stdout.write(
            'Packaged authorizer (ESM) handled authentic TOKEN/REQUEST events, denied invalid tokens, kept a warm cached secret and failed closed when cold\n',
        )
    } finally {
        await new Promise((resolve) => stub.close(resolve))
        rmSync(stage, { recursive: true, force: true })
    }
}

main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
})
