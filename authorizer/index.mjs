import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { authorizeToken, tokenFromEvent } from './token-policy.mjs'

const secretsManager = new SecretsManagerClient({ region: 'eu-south-1' })
const jwtSecretTtlMs = 5 * 60 * 1000
/** @type {string | null} */
let cachedJwtSecret = null
let cachedJwtSecretExpiresAt = 0
async function getJwtSecret() {
    if (cachedJwtSecret && Date.now() < cachedJwtSecretExpiresAt) return cachedJwtSecret
    const response = await secretsManager.send(new GetSecretValueCommand({ SecretId: 'studup-jwt-secret' }))
    if (!response.SecretString) throw new Error('JWT secret is unavailable')
    cachedJwtSecret = response.SecretString
    cachedJwtSecretExpiresAt = Date.now() + jwtSecretTtlMs
    return cachedJwtSecret
}
/** @param {import('./token-policy.mjs').AuthorizerEvent} event */
export async function handler(event) {
    if (!tokenFromEvent(event)) return authorizeToken(event, '')
    try {
        return authorizeToken(event, await getJwtSecret())
    } catch {
        return authorizeToken(event, '')
    }
}
