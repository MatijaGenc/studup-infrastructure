import jwt from 'jsonwebtoken'
const {verify}=jwt
/** @typedef {{methodArn: string, authorizationToken?: string, headers?: Record<string, string | undefined>}} AuthorizerEvent */
/** @param {AuthorizerEvent} event */
export function tokenFromEvent(event) {
    return (event.authorizationToken ?? event.headers?.Authorization ?? event.headers?.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
}
/** @param {AuthorizerEvent} event @param {'Allow' | 'Deny'} effect @param {string} principalId */
function policy(event, effect, principalId) {
    const [api, stage] = event.methodArn.split('/')
    // TOKEN policies are cached by token; application handlers enforce roles and ownership.
    const resource = stage ? `${api}/${stage}/*/*` : event.methodArn
    return {principalId,policyDocument:{Version:'2012-10-17',Statement:[{Action:'execute-api:Invoke',Effect:effect,Resource:resource}]},context:{userId:principalId}}
}
/** @param {AuthorizerEvent} event @param {string} secret */
export function authorizeToken(event, secret) {
    const token=tokenFromEvent(event)
    if (!token) return policy(event,'Deny','unauthorized')
    try {
        const decoded=verify(token,secret,{algorithms:['HS256']})
        if (typeof decoded === 'string') return policy(event,'Deny','unauthorized')
        /** @type {unknown} */
        const user=decoded.user
        if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string' || !('type' in user) || !['student','employer'].includes(String(user.type))) return policy(event,'Deny','unauthorized')
        return policy(event,'Allow',user.id)
    } catch { return policy(event,'Deny','unauthorized') }
}
