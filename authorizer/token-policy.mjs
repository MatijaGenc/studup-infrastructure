import jwt from 'jsonwebtoken'

const { verify } = jwt
/** @typedef {{methodArn: string, authorizationToken?: string, headers?: Record<string, string | undefined>}} AuthorizerEvent */
/** @typedef {Record<string, string | number | boolean>} AuthorizerContext */
/** @param {AuthorizerEvent} event */
export function tokenFromEvent(event) {
    return (event.authorizationToken ?? event.headers?.Authorization ?? event.headers?.authorization ?? '')
        .replace(/^Bearer\s+/i, '')
        .trim()
}
/** @param {AuthorizerEvent} event @param {'Allow' | 'Deny'} effect @param {string} principalId @param {AuthorizerContext} context */
function policy(event, effect, principalId, context = {}) {
    const [api, stage] = event.methodArn.split('/')
    // Cache by token: the policy covers every method and path in this API stage only.
    const resource = stage ? `${api}/${stage}/*/*` : event.methodArn
    return {
        principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }],
        },
        context: { userId: principalId, ...context },
    }
}
/** @param {AuthorizerEvent} event @param {string} secret */
export function authorizeToken(event, secret) {
    const token = tokenFromEvent(event)
    if (!token) return policy(event, 'Deny', 'unauthorized')
    try {
        const decoded = verify(token, secret, { algorithms: ['HS256'] })
        if (typeof decoded === 'string') return policy(event, 'Deny', 'unauthorized')
        /** @type {unknown} */
        const user = decoded.user
        if (!user || typeof user !== 'object') return policy(event, 'Deny', 'unauthorized')
        const claims = /** @type {{id?: unknown, type?: unknown, isAdmin?: unknown, tokenVersion?: unknown}} */ (user)
        if (typeof claims.id !== 'string' || claims.id.trim() === '') return policy(event, 'Deny', 'unauthorized')
        if (claims.type !== 'student' && claims.type !== 'employer') return policy(event, 'Deny', 'unauthorized')
        if (
            claims.tokenVersion !== undefined &&
            (typeof claims.tokenVersion !== 'number' || !Number.isFinite(claims.tokenVersion))
        )
            return policy(event, 'Deny', 'unauthorized')
        return policy(event, 'Allow', claims.id, { userType: claims.type, isAdmin: claims.isAdmin === true })
    } catch {
        return policy(event, 'Deny', 'unauthorized')
    }
}
