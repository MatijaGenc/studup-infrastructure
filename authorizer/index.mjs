import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { verify } from 'jsonwebtoken'

const secretsManager = new SecretsManagerClient({ region: 'eu-south-1' })
let cachedJwtSecret = null

async function getJwtSecret() {
    if (cachedJwtSecret) {
        return cachedJwtSecret
    }
    const response = await secretsManager.send(new GetSecretValueCommand({ SecretId: 'studup-jwt-secret' }))
    cachedJwtSecret = response.SecretString
    return cachedJwtSecret
}

function denyAll(event) {
    return {
        principalId: 'unauthorized',
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: 'Deny',
                    Resource: event.methodArn,
                },
            ],
        },
    }
}

function allowAll(event, userId) {
    return {
        principalId: userId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: 'Allow',
                    Resource: event.methodArn,
                },
            ],
        },
        context: {
            userId,
        },
    }
}

export async function handler(event) {
    const token =
        event.headers?.Authorization ??
        event.headers?.authorization ??
        event.headers?.['X-Access-Token'] ??
        event.headers?.['x-access-token']

    if (!token) {
        return denyAll(event)
    }

    try {
        const jwtSecret = await getJwtSecret()
        const decoded = verify(token, jwtSecret)
        const userId = typeof decoded === 'string' ? 'unknown' : decoded.sub ?? 'unknown'
        return allowAll(event, String(userId))
    } catch {
        return denyAll(event)
    }
}