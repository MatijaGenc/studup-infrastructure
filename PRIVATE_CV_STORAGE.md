# Private CV storage cutover — deployed 6 November 2026

The production CV privacy cutover was explicitly approved and executed on 6 November 2026 (`Approve privacy cutover now`). It removed the public-read path for `cv/*` on CloudFront distribution `E3QIPLNGFSS6DH` and enabled all four S3 public-access-block flags on the `stud-up-cv-files` bucket. The change was made with scoped AWS CLI operations; no Terraform apply or state write was performed.

## Scope of the applied change

- Deleted the CV bucket policy. The prior policy granted `s3:GetObject` on `arn:aws:s3:::stud-up-cv-files/*` to CloudFront OAI `E3CC9QX4170HO1` (statement `AllowCloudFrontOAI`). A post-change `GetBucketPolicy` returns `NoSuchBucketPolicy`.
- Set all four public-access-block flags to `true`: `BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`, `RestrictPublicBuckets`. Only `BlockPublicPolicy` changed (it was `false`); the other three were already `true`.
- Invalidated `/cv/*` on distribution `E3QIPLNGFSS6DH`. Invalidation `IA22IDBT98RWWQZ2AW524V1HVG` reached `Completed` (created `2026-11-06T06:15:38Z`).
- CloudFront distribution/origin/OAI configuration and unrelated buckets are unchanged. DataHandler's existing scoped `GetObject` permission remains.

## Verification evidence and its limits

- `https://www.studup.net/auth` returns `200`, so unrelated site delivery is working.
- Anonymous requests to random, nonexistent synthetic CV paths return `403` on both aliases: `www.studup.net/cv/_synthetic-privacy-check/<uuid>.pdf` and `d359m0pva1orzs.cloudfront.net/cv/_synthetic-privacy-check/<uuid>.pdf`.
- Current public JavaScript/CSS assets also return200 with the expected non-HTML content types. Read-only IAM simulation confirms the live DataHandler role retains `s3:GetObject` for the CV bucket. Permission simulation does not establish positive object delivery.
- No real student CV was read. No test object or account was created, and no account writes were made.

These checks show the old unsigned path is denied and the bucket policy is absent. They do **not** prove positive delivery through the authorized signed S3/API path: a `403` on nonexistent paths would occur whether or not the private delivery path works. Positive signed-provider end-to-end verification remains outstanding (see below).

## Source and client compatibility

Source commit `e626cb2` is already on `main`, with compatible API `52f16fc`, frontend `dbf85e527`, and mobile `93bf1fa` (private CV access plus `9b20b48` navigation) and green CI. Compatibility is established at source/CI level only.

Legacy published mobile store builds still use raw `/cv/*` links. Those links now stop working until updated store apps are released. Local review builds are not publication and do not update installed apps.

## Terraform and state

The production change was an approved out-of-band AWS CLI operation, not a Terraform apply. A read-only, targeted post-cutover plan reports `No changes. Your infrastructure matches the configuration.` for the CV bucket policy and public-access-block resources. That plan carries Terraform's resource-targeting warning (it does not represent the full configuration) and a deprecated `dynamodb_table` parameter warning. Do not treat it as broader configuration coverage or as evidence that Terraform state was written.

Any future apply against this configuration should be a no-op for these resources. Stop if a plan proposes re-adding the OAI bucket policy or disabling `BlockPublicPolicy`.

## Outstanding release verification

1. Perform signed-provider end-to-end verification with an explicitly approved synthetic, non-sensitive object/account: the student owner or an employer receiving that student's application to their own job obtains a working short-lived managed URL through the authorized document API; an unauthorized caller is denied; no real student CV is retrieved.
2. Confirm updated store apps have replaced legacy raw `/cv/*` usage before relying on mobile CV delivery.
3. Re-invalidate only if a later change requires cache eviction; the existing `/cv/*` invalidation is already `Completed`.

## Deployment order for other environments

For any environment not yet cut over, keep this order:

1. Deploy and verify the authorized document endpoint and compatible web/mobile clients. API authorization requires the student owner or an employer receiving that student's application to their own job; no ordinary admin bypass. Managed CV URLs expire after 60 seconds. Existing external HTTPS certificate/document references remain external.
2. Obtain explicit approval for that environment's CV storage policy change and `/cv/*` invalidation.
3. Plan with the correct current infrastructure inputs, limited to removing the CV CloudFront OAI bucket policy and updating the CV bucket public-access-block resource. Never apply a placeholder-input binary.
4. Apply only the reviewed policy/public-block change, then invalidate `/cv/*` on the distribution and wait for `Completed`. Blocking the origin alone does not remove already-cached public responses.
5. Verify unsigned denial and authorized short-lived delivery using an approved synthetic, non-sensitive object/account. Never retrieve a real student's CV as a test. Confirm unrelated site assets work.

## Rollback

A rollback that restores the OAI read grant re-opens public CV delivery. Prefer fixing the private path. Any emergency restoration requires explicit approval and a recorded reason; it also requires reversing `BlockPublicPolicy` so a policy can be attached again, and another invalidation to evict cached `403` responses. Do not delete or recreate the distribution, origin, OAI, or bucket.

## Evidence

Current receipts: `recheck-fixes-2026-11-06/cv-cutover/` (`receipt.json`, before/after policy and public-block snapshots, `invalidation.json`, `invalidation-status.json`, `anonymous-http-checks.json`, `targeted-post-cutover-plan.txt`).

Historical preparation evidence: `recheck-fixes-2026-11-05/private-cv-infra/`, including read-only metadata, targeted plan, rollback proposal and full quality checks. Source-level policy tests supplement Terraform validation; they do not prove deployed AWS behavior.
