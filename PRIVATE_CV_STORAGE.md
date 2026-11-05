# Private CV storage cutover — prepared, not applied

Read-only AWS inspection on5 November2026 confirmed that `cv/*` on CloudFront distribution `E3QIPLNGFSS6DH` has no trusted signer/key group. Its origin OAI could read the private `stud-up-cv-files` bucket, so knowing a CV URL bypasses application-level document permissions. No real student CV was fetched.

This patch removes the CV bucket's CloudFront OAI read policy and sets all four S3 public-access-block flags to true. DataHandler's existing scoped GetObject permission remains. The CloudFront distribution/origin and unrelated buckets are unchanged. Infrastructure CI validates source and packages; it does not apply Terraform.

## Required deployment order

1. Deploy and verify the authorized document endpoint and compatible web/mobile clients. API authorization requires the student owner or an employer receiving that student's application to their own job; no ordinary admin bypass. Managed CV URLs expire after60 seconds. Existing external HTTPS certificate/document references remain external.
2. Obtain explicit approval for the production CV storage policy change and `/cv/*` CloudFront invalidation. No such approval has been assumed.
3. Re-plan with the correct current infrastructure inputs, limited to removing `aws_s3_bucket_policy.cv_files_cloudfront` and updating `aws_s3_bucket_public_access_block.cv_files`. The reviewed preparatory plan had0 additions,1 change and1 deletion. Its placeholder-input binary was removed and must never be applied.
4. Apply only the reviewed policy/public-block change. Invalidate `/cv/*` on distribution `E3QIPLNGFSS6DH` and wait for Completed. Blocking the origin alone does not remove already-cached public responses.
5. Verify unsigned denial and authorized short-lived delivery using an explicitly approved synthetic, non-sensitive object/account. Never retrieve a real student's CV as a test. Confirm unrelated site assets work.

A rollback that restores the OAI read grant re-opens public CV delivery. Prefer fixing the private path; any emergency restoration requires explicit approval, a recorded reason and another invalidation to evict cached403 responses. Do not delete/recreate the distribution, origin, OAI or bucket.

Local evidence: `recheck-fixes-2026-11-05/private-cv-infra/`, including read-only metadata, targeted plan, rollback proposal and full quality checks. Source-level policy tests supplement Terraform validation; they do not prove deployed AWS behavior. This item remains open until the approved production cutover is verified.
