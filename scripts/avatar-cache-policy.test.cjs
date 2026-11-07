const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')

const root = join(__dirname, '..')
const cloudfront = readFileSync(join(root, 'cloudfront.tf'), 'utf8')
const s3 = readFileSync(join(root, 's3.tf'), 'utf8')
const lambda = readFileSync(join(root, 'lambda.tf'), 'utf8')

function resourceBlock(source, type, name) {
    const marker = `resource "${type}" "${name}"`
    const start = source.indexOf(marker)
    assert.notEqual(start, -1, `missing ${marker}`)
    const open = source.indexOf('{', start)
    let depth = 0
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1
        else if (source[index] === '}') {
            depth -= 1
            if (depth === 0) return source.slice(start, index + 1)
        }
    }
    assert.fail(`unterminated ${marker}`)
}

function cacheBehavior(source, pathPattern) {
    const needle = `"${pathPattern}"`
    const matchIndex = source.indexOf(needle)
    assert.notEqual(matchIndex, -1, `missing cache behavior for ${pathPattern}`)
    const start = source.lastIndexOf('ordered_cache_behavior', matchIndex)
    assert.notEqual(start, -1, `missing ordered cache behavior for ${pathPattern}`)
    const open = source.indexOf('{', start)
    let depth = 0
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1
        else if (source[index] === '}') {
            depth -= 1
            if (depth === 0) return source.slice(open, index + 1)
        }
    }
    assert.fail(`unterminated cache behavior for ${pathPattern}`)
}

test('avatar cache behavior uses a policy that includes the version query in the cache key', () => {
    const behavior = cacheBehavior(cloudfront, 'images/*')
    assert.match(behavior, /cache_policy_id\s*=\s*aws_cloudfront_cache_policy\.profile_images\.id/)
    assert.doesNotMatch(behavior, /658327ea-f89d-4fab-a63d-7e88639e58f6/)

    const policy = resourceBlock(cloudfront, 'aws_cloudfront_cache_policy', 'profile_images')
    assert.match(policy, /query_string_behavior\s*=\s*"whitelist"/)
    assert.match(policy, /items\s*=\s*\["v"\]/)
    assert.match(policy, /default_ttl\s*=\s*86400/)
    assert.match(policy, /max_ttl\s*=\s*31536000/)
})

test('avatar bucket keeps version history bounded so deleted replacements expire', () => {
    const versioning = resourceBlock(s3, 'aws_s3_bucket_versioning', 'profile_images')
    assert.match(versioning, /status\s*=\s*"Enabled"/)

    const lifecycle = resourceBlock(s3, 'aws_s3_bucket_lifecycle_configuration', 'profile_images')
    assert.match(lifecycle, /noncurrent_days\s*=\s*30/)
})

test('DataHandler can delete replaced avatar objects', () => {
    const policy = resourceBlock(lambda, 'aws_iam_policy', 's3_profile_images')
    assert.match(policy, /s3:PutObject/)
    assert.match(policy, /s3:DeleteObject/)
    assert.match(policy, /aws_s3_bucket\.profile_images\.arn/)
})
