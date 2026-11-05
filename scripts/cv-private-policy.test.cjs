const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')

const root = join(__dirname, '..')
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

function allResourceBlocks(source, type) {
    const blocks = []
    const pattern = new RegExp(`resource "${type}" "([^"]+)"`, 'g')
    for (const match of source.matchAll(pattern)) blocks.push(resourceBlock(source, type, match[1]))
    return blocks
}

test('CV bucket blocks public access', () => {
    const block = resourceBlock(s3, 'aws_s3_bucket_public_access_block', 'cv_files')
    for (const setting of ['block_public_acls', 'ignore_public_acls', 'block_public_policy', 'restrict_public_buckets'])
        assert.match(block, new RegExp(`${setting}\\s*=\\s*true`), `${setting} must be true`)
})

test('no bucket policy grants CloudFront OAI access to CV objects', () => {
    for (const block of allResourceBlocks(s3, 'aws_s3_bucket_policy')) {
        const targetsCv = block.includes('aws_s3_bucket.cv_files') || block.includes('stud-up-cv-files')
        assert.equal(targetsCv, false, 'CV bucket must not have a bucket policy; Lambda uses its IAM role')
    }
})

test('DataHandler Lambda retains scoped CV GetObject access', () => {
    const block = resourceBlock(lambda, 'aws_iam_policy', 's3_cv_files')
    assert.match(block, /s3:GetObject/)
    assert.match(block, /aws_s3_bucket\.cv_files\.arn/)
})
