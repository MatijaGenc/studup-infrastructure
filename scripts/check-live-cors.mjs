import assert from 'node:assert/strict'

const origin = 'https://www.studup.net'
const requiredHeaders = ['content-type', 'authorization', 'x-access-token', 'x-client-type', 'idempotency-key']
const bases = process.argv.filter((arg) => arg.startsWith('--base=')).map((arg) => arg.slice(7))
if (bases.length === 0) bases.push('https://userapi.studup.net', 'https://userapi.studup.net/data-api')

// This opt-in production smoke sends only OPTIONS and anonymous GET requests.
for (const base of bases) {
    assert.equal(new URL(base).protocol, 'https:')
    for (const method of ['POST', 'PATCH', 'DELETE']) {
        const response = await fetch(`${base}/jobs`, {
            method: 'OPTIONS',
            headers: {
                Origin: origin,
                'Access-Control-Request-Method': method,
                'Access-Control-Request-Headers': requiredHeaders.join(','),
            },
            signal: AbortSignal.timeout(15000),
        })
        assert.equal(response.status, 200, `${base}: preflight status`)
        assert.equal(response.headers.get('access-control-allow-origin'), origin)
        assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
        const allowed =
            response.headers
                .get('access-control-allow-headers')
                ?.toLowerCase()
                .split(',')
                .map((value) => value.trim()) ?? []
        for (const header of requiredHeaders) assert.ok(allowed.includes(header), `${base}: missing allowed header ${header}`)
        assert.ok(response.headers.get('access-control-allow-methods')?.split(',').includes(method))
        console.log(`PASS ${method} preflight: ${base}/jobs`)
    }
    const protectedResponse = await fetch(`${base}/jobs`, { headers: { Origin: origin }, signal: AbortSignal.timeout(15000) })
    assert.equal(protectedResponse.status, 401, `${base}: anonymous private request must remain unauthorized`)
    assert.equal(protectedResponse.headers.get('access-control-allow-origin'), origin)
    console.log(`PASS anonymous private request stays 401: ${base}/jobs`)
}
