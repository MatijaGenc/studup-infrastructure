# INF-001 — Terraform hygiene, drift ownership and CI security scan

Date: 8 November 2026. Branch: `INF-001-terraform-hygiene` (from main `d1e3a0f`).
This change is code/documentation only. No AWS command, `terraform plan`, `terraform apply`,
merge or push was performed by this task.

> **Ownership inventory:** every remaining `ignore_changes` block, secret, log group,
> S3 bucket/lifecycle rule, SNS topic/subscription and alarm — with its owner, review
> date, required evidence and the open owner decisions — is now tracked in
> [docs/OWNERSHIP_MATRIX.md](docs/OWNERSHIP_MATRIX.md). This file remains the change
> record and gate log; the matrix is the reviewable inventory. Neither is live proof.

## 1. `ignore_changes` review

Every existing block was inspected against its resource, the provider schema
(`terraform providers schema -json`), and the actual external writer (backend deploy /
migration workflow, rotation Lambda, console/import drift). No resource was added,
removed or renamed. No block now ignores a whole resource.

| #   | Resource / file                                                                 | Before                                                                                                                                                                                                                                                                                                                                                                                                                                         | After                                                                                                                                                                  | Why it is ignored                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Owner                                                                                       |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | `aws_lambda_function.db_password_rotation` — `rotation-lambda.tf:78`            | `filename`, `source_code_hash`                                                                                                                                                                                                                                                                                                                                                                                                                 | none (block removed)                                                                                                                                                   | Nothing publishes this function outside Terraform; the ZIP is rebuilt deterministically by `npm run build`. Terraform should own the code. A later apply may update it in place.                                                                                                                                                                                                                                                                                                                            | Infrastructure Terraform                                                                    |
| 2   | `aws_secretsmanager_secret_rotation.db_password` — `rotation-lambda.tf:110`     | `secret_id`                                                                                                                                                                                                                                                                                                                                                                                                                                    | `secret_id` (kept, commented)                                                                                                                                          | AWS normalises `secret_id` to the secret ARN after apply while the config keeps the name; reasserting it would plan a spurious rotation replacement.                                                                                                                                                                                                                                                                                                                                                        | Platform owner                                                                              |
| 3   | `aws_secretsmanager_secret_version.app_database_password` — `migration.tf:17`   | `secret_string`                                                                                                                                                                                                                                                                                                                                                                                                                                | `secret_string` (kept, commented)                                                                                                                                      | Seeded once by `random_password`; the app-role password is then owned by the backend migration/bootstrap path.                                                                                                                                                                                                                                                                                                                                                                                              | Backend / data owner                                                                        |
| 4   | `aws_lambda_function.db_migrator` — `migration.tf:111`                          | `filename`, `source_code_hash`                                                                                                                                                                                                                                                                                                                                                                                                                 | `source_code_hash`                                                                                                                                                     | The backend `migrate` job replaces the handler with the built runner via `aws lambda update-function-code`; Terraform only seeds the placeholder. `filename` goes back to Terraform.                                                                                                                                                                                                                                                                                                                        | Backend release workflow                                                                    |
| 5   | `aws_cloudfront_distribution.studup` — `cloudfront.tf:112`                      | `default_cache_behavior[0].default_ttl`, `max_ttl`, `min_ttl`                                                                                                                                                                                                                                                                                                                                                                                  | unchanged (commented)                                                                                                                                                  | TTLs are governed by the referenced managed cache policy; these legacy inline fields are provider/cache-policy defaults, not out-of-band edits. Already the minimal path list.                                                                                                                                                                                                                                                                                                                              | Infrastructure Terraform                                                                    |
| 6   | `aws_iam_role.lambda` — `lambda.tf:56`                                          | `managed_policy_arns`                                                                                                                                                                                                                                                                                                                                                                                                                          | unchanged (commented)                                                                                                                                                  | The live role has AWS managed policies (VPC access/logs) attached outside Terraform because only custom attachments are modelled. Ignoring avoids detaching them; importing is a separate owner-reviewed change.                                                                                                                                                                                                                                                                                            | Platform / security owner                                                                   |
| 7   | `aws_lambda_function.data_handler` — `lambda.tf:145`                            | `s3_key`, `s3_bucket`                                                                                                                                                                                                                                                                                                                                                                                                                          | unchanged (commented)                                                                                                                                                  | Backend release deploys code with `update-function-code`; the Lambda API does not return Terraform's S3 source location, so reasserting these fields would plan a stale-artifact republish. Both fields are genuinely deploy-owned.                                                                                                                                                                                                                                                                         | Backend release workflow                                                                    |
| 8   | `aws_lambda_function.outbox_worker` — `lambda.tf:216`                           | `s3_key`, `s3_bucket`                                                                                                                                                                                                                                                                                                                                                                                                                          | unchanged (commented)                                                                                                                                                  | Same as #7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Backend release workflow                                                                    |
| 9   | `aws_secretsmanager_secret_version.database_password` — `secrets-manager.tf:11` | `secret_string`                                                                                                                                                                                                                                                                                                                                                                                                                                | unchanged (commented)                                                                                                                                                  | RDS master password is rotated every 30 days by `studup-db-password-rotation`; Terraform seeds only the first value.                                                                                                                                                                                                                                                                                                                                                                                        | Security owner / rotation Lambda                                                            |
| 10  | `aws_secretsmanager_secret_version.jwt_secret` — `secrets-manager.tf:25`        | `secret_string`                                                                                                                                                                                                                                                                                                                                                                                                                                | unchanged (commented)                                                                                                                                                  | JWT signing secret is rotated out-of-band per `docs/INCIDENT_RECOVERY_RUNBOOK.md`; Terraform seeds only the first value.                                                                                                                                                                                                                                                                                                                                                                                    | Security owner                                                                              |
| 11  | `aws_secretsmanager_secret_version.email_api_key` — `secrets-manager.tf:39`     | `secret_string`                                                                                                                                                                                                                                                                                                                                                                                                                                | unchanged (commented)                                                                                                                                                  | Brevo API key is rotated in the Brevo console and written here out-of-band.                                                                                                                                                                                                                                                                                                                                                                                                                                 | Email / security owner                                                                      |
| 12  | `aws_db_instance.dev` — `rds.tf:33`                                             | 18 attributes: `engine_version`, `db_name`, `backup_target`, `ca_cert_identifier`, `customer_owned_ip_enabled`, `database_insights_mode`, `enabled_cloudwatch_logs_exports`, `iam_database_authentication_enabled`, `iops`, `kms_key_id`, `license_model`, `storage_throughput`, `parameter_group_name`, `option_group_name`, `performance_insights_kms_key_id`, `performance_insights_retention_period`, `vpc_security_group_ids`, `password` | 7 attributes: `enabled_cloudwatch_logs_exports`, `iam_database_authentication_enabled`, `vpc_security_group_ids`, `password`, `db_name`, `backup_target`, `kms_key_id` | The removed attributes are provider-owned/`Optional+Computed` in AWS provider 6.70.0 (checked against the provider source and `terraform providers schema -json`), so an omitted config keeps the remote value. The four working attributes are console settings/SGs and the rotated master password. `db_name`, `backup_target` and `kms_key_id` are `ForceNew` in the provider source and are kept specifically so the narrowed list cannot plan a replacement while the state is still being reconciled. | Platform owner (console settings/SGs/ForceNew); security owner / rotation Lambda (password) |

Notes on plan semantics:

- No removed attribute is `ForceNew` in the provider source for the attributes that were
  dropped; the three `ForceNew` attributes (`db_name`, `backup_target`, `kms_key_id`) stay
  ignored. This is a source/schema-based conclusion, not a plan: a real plan needs AWS
  credentials and was **not** run.
- Removing #1 restores Terraform ownership of the rotation function; the next reviewed
  apply may include an in-place code update.
- `terraform fmt -check -recursive` and `terraform validate` pass after the edits.

## 2. CI security/schema validation

`.github/workflows/validate.yml` runs the security scan after
`terraform init -backend=false -lockfile=readonly` and `npm run check`:

Current ordering (verified against the workflow on 10 November 2026):

1. `terraform init -backend=false -lockfile=readonly`
2. `npm run check`
3. Trivy `config` scan
4. artifact upload

The scan runs **after** the quality gates, on the same checkout. It does not delete a
cache directory and the workflow does not exclude or remove project files for the scan;
the only scan skips are the dependency/tooling directories listed below. This ordering
must stay: if the scan ever runs first, its downloaded cache can break the formatting
gate, and working around that by deleting or excluding files would hide project content
from the gates instead of validating it.

| Item           | Value                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Action         | `aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1` (`v0.35.0`, full-SHA pin) |
| Scanner        | Trivy `v0.69.3` (explicit `version` input), `scan-type: config`                                |
| Failure policy | `severity: HIGH,CRITICAL`, `exit-code: 1`                                                      |
| Scope          | repository root; skips `node_modules`, `.terraform`, `.venv-quality`, `graphify-out`           |
| Exceptions     | `.trivyignore.yaml` (path-scoped, reasoned, expiring)                                          |

Existing gates remain: formatting, provider/schema validation, package build, tooling
tests and artifact upload. The local `npm run check` chain is unchanged — Trivy is not a
local dependency, so no new required local binary was introduced.

A reviewed `terraform plan` still requires AWS credentials. It was deliberately **not**
faked or added as a CI step; it remains an owner-only step.

## 3. Scanner result and recorded exceptions

Executed locally with the exact action version Trivy `v0.69.3` (and cross-checked with
`v0.76.2`) using the committed `.trivyignore.yaml`:

- Command: `trivy config --severity HIGH,CRITICAL --exit-code 1 --ignorefile .trivyignore.yaml .`
- Result: exit 0, no unexcepted HIGH/CRITICAL findings.
- Baseline before exceptions: **17 findings — 3 CRITICAL, 14 HIGH** across 8 check IDs.

| Check    | Severity | Findings | Where                                | Recorded reason / owner                                                                                    |
| -------- | -------- | -------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| AWS-0005 | HIGH     | 2        | `api-gateway.tf` custom domains      | `security_policy` unset (TLS 1.0 default); TLS 1.2 is an owner-reviewed API change. Platform owner.        |
| AWS-0104 | CRITICAL | 3        | `lambda.tf` egress rules             | 0.0.0.0/0 egress on 443/5432/53; narrowing needs VPC endpoint/network design. Platform owner.              |
| AWS-0095 | HIGH     | 1        | `monitoring.tf` alarm topic          | SNS unencrypted; payloads carry no personal data; KMS is a monitoring change. Platform owner.              |
| AWS-0086 | HIGH     | 1        | `s3.tf` website bucket               | Public ACLs required by S3 website origin. Platform owner.                                                 |
| AWS-0087 | HIGH     | 3        | `s3.tf` website/root/profile buckets | Public policy block disabled for website hosting and the OAI policy. Platform owner.                       |
| AWS-0091 | HIGH     | 1        | `s3.tf` website bucket               | Ignoring public ACLs would break the website origin. Platform owner.                                       |
| AWS-0093 | HIGH     | 2        | `s3.tf` website/root buckets         | Public read required by S3 website hosting; CV/profile remain restricted. Platform owner.                  |
| AWS-0132 | HIGH     | 4        | `s3.tf` SSE configs                  | SSE-S3 is used; CMK adds a new key resource/policy and cost, outside this change. Platform/security owner. |

Every exception has a `statement` (reason + owner) and `expired_at: 2027-03-31`; there
are no blanket file or wildcard skips. After expiry the gate fails until an owner
re-reviews. This is a recorded risk acceptance, not a silent suppression.

What the scanner did **not** verify:

- It did not run inside GitHub Actions in this task, so no CI run is claimed.
- It did not evaluate live AWS state, state locking, or a plan (`terraform plan`).
- It did not prove that the narrowed `ignore_changes` lists produce zero plan diff.
- It did not prove the six destroys in the earlier reviewed plan are still the only
  changes; the changed ignore lists require a fresh owner-reviewed plan.

## 4. Gate results actually executed

| Gate                                               | Result                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `terraform init -backend=false -lockfile=readonly` | success (no lockfile change)                                                        |
| `terraform fmt -check -recursive`                  | exit 0                                                                              |
| `terraform validate`                               | success                                                                             |
| `npm run check`                                    | exit 0 (typecheck, format, lint, build, Terraform validation, tests, docs/licenses) |
| `npm test`                                         | authorizer 11/11, Python 22 tests OK                                                |
| `npm run test:gates` (inside `check`)              | 74/74 Node tooling tests                                                            |
| Trivy config scan (v0.69.3, exact action version)  | exit 0 with committed exceptions                                                    |
| Trivy config scan (v0.76.2 cross-check)            | exit 0 with committed exceptions                                                    |

## 5. INF-001 checkbox status

- [x] Compare A-072–A-088 with main — already complete before this task.
- [ ] Resolve egress/logging/storage/state locking/monitoring and document Terraform vs
  deploy-CI ownership — **partial only**. This task documents deploy-CI ownership for
  Lambda artifact/code (`update-function-code`), migration bootstrap, rotation Lambda,
  secrets and RDS console drift. It does not resolve the egress/logging/storage/state-lock
  or monitoring settings.
- [x] Narrow broad `ignore_changes`; intentional drift has a reason and owner — **complete
  as a code/documentation change**.
- [ ] CI validates formatting, provider/schema, security rules, packaging and reviewed
  plans — **partial**. Formatting, provider/schema, security rules and packaging are
  implemented. A reviewed plan needs AWS credentials and is owner-only, so this checkbox
  cannot be claimed complete here.
- [ ] No unexpected destruction in the reviewed plan; do not apply to prove validation —
  **owner-only**. Not verified here; no plan/apply was run.

## 6. Remaining owner-only work

1. Re-run and review a real `terraform plan` after these edits, with the normal build
   (`npm run build`) so the rotation ZIP exists. Confirm no new destroys and that the
   prior six destroys are still the expected/approved set.
2. Approve or fix the eight recorded scanner exceptions. In particular, decide whether to
   set API Gateway `security_policy = "TLS_1_2"`, add SNS encryption, and move S3 to CMKs.
3. Apply the reviewed plan (owner only), then record the applied change set and verified
   live outcome. This branch intentionally does not apply anything.
4. Resolve the unresolved egress/logging/storage/state-lock/monitoring ownership items in
   the parent criterion.
5. Observe the exact CI run for this branch when Actions is available; no run is claimed.
