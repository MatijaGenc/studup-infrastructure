# Incident and recovery runbook

Status: checked-in procedure, not proof of a live drill. Commands that touch production
AWS, production data, or send real email/SMS are marked **OWNER ONLY**. The repository
owner (acting as platform owner) must execute or explicitly delegate them and record the
timestamp, operator, commit/artifact, outcome and data-loss window. No step in this
document authorises a production `terraform apply`.

## Ownership

| Role               | Owns                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| On-call responder  | First triage, alarm acknowledgement, incident timeline, escalation.                         |
| Platform owner     | AWS/Terraform changes, deploy rollback, alarm delivery and production command execution.    |
| Backend owner      | Lambda code, API behaviour, migrations, pagination/runtime changes, release artifacts.      |
| Data/privacy owner | RDS restore/PITR, S3 personal-data recovery, deletion/retention decisions and notification. |
| Security owner     | Secret rotation, credential exposure response, OIDC/IAM review.                             |

If the same person holds several roles, record which role authorised each production
step. Never paste secret values, database URLs, tokens or personal data into the
incident record, this repository or chat.

## Detection sources

All alarms publish to the `studup-alarms` SNS topic. The email subscription endpoint is
defined in `monitoring.tf`; the recipient must confirm the SNS subscription before
delivery can work. Alarm delivery itself is an owner-only drill (see below).

| Source                                                            | What it means                                                   | First check                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `studup-api-gateway-5xx-data-api`                                 | Private data API returned more than 5 5XX responses in 2×5 min. | CloudWatch API metrics, DataHandler logs, recent deploy.                    |
| `studup-api-gateway-5xx-dta-api` / `...-open-api`                 | Same for the dta/open APIs.                                     | Same; distinguish gateway/authorizer failures from handler failures.        |
| `studup-lambda-errors`                                            | `DataHandler` errors exceeded 3 in 10 min.                      | `/aws/lambda/DataHandler` log group, request IDs, release SHA.              |
| `studup-rotation-lambda-errors`                                   | DB password rotation Lambda failed.                             | `/aws/lambda/studup-db-password-rotation`, Secrets Manager rotation status. |
| `studup-health-check-failure`                                     | `/health` logged `Health check failed` (database unreachable).  | RDS status/connections, Secrets Manager, VPC/SG, credentials.               |
| `studup-rds-cpu-utilization`                                      | RDS CPU > 80% for 10 min.                                       | RDS Performance Insights/CPU, slow queries, connection count.               |
| `studup-rds-database-connections`                                 | RDS connections > 60 (instance max is roughly 85–100).          | `pg_stat_activity`, pool size, Lambda concurrency.                          |
| `studup-rds-free-storage-space`                                   | RDS free storage below 5 GB.                                    | Table/index growth, WAL, autoscaling storage.                               |
| `studup-outbox-worker-errors` / `studup-outbox-delivery-failures` | Outbox worker failed or reported failed deliveries.             | `/aws/lambda/studup-outbox-worker`, `outbox_events` FAILED rows.            |

Useful read-only commands:

```bash
aws cloudwatch describe-alarms \
  --state-value ALARM \
  --query 'MetricAlarms[].{name:AlarmName,state:StateValue,reason:StateReason}' \
  --output table

aws logs tail /aws/lambda/DataHandler --since 30m
aws logs tail /aws/lambda/studup-outbox-worker --since 30m
aws logs tail /aws/lambda/studup-db-migrator --since 1h
aws logs tail /aws/lambda/studup-db-password-rotation --since 1h

aws rds describe-db-instances --db-instance-identifier dev \
  --query 'DBInstances[0].{status:DBInstanceStatus,multiAZ:MultiAZ,latestRestorable:LatestRestorableTime,backupDays:BackupRetentionPeriod}'
```

### Alarm delivery drill — OWNER ONLY

```bash
TOPIC_ARN=$(aws sns list-topics \
  --query "Topics[?contains(TopicArn,'studup-alarms')].TopicArn | [0]" --output text)
aws sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN"
aws sns publish --topic-arn "$TOPIC_ARN" \
  --message "OPS-001 alarm delivery drill $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Record the publish time and the time the owner received the email. A pending/unconfirmed
subscription is a detection gap, not a passing test.

## Deploy rollback from the saved artifact

The backend deploy workflow (`backend/.github/workflows/default.yaml`) saves the
currently deployed `DataHandler` and `studup-outbox-worker` ZIPs before replacing them.
It uploads `previous-DataHandler.zip`, `previous-studup-outbox-worker.zip` and
`release.json` in the `backend-release-<commit>` Actions artifact for 90 days.
The frontend workflow uploads `frontend-release-<commit>` (metadata only); a previous
`frontend-build` artifact is retained for 14 days, and the website bucket is versioned.

**OWNER ONLY — production rollback.**

1. Confirm the failing release commit/SHA and the last known-good commit.
2. Download the last known-good `backend-release-<sha>` artifact from the Actions run.
3. Roll back both Lambda functions, not one:

```bash
gh run download <known-good-run-id> -n backend-release-<known-good-sha> -D rollback
cd rollback
sha256sum previous-DataHandler.zip previous-studup-outbox-worker.zip
cat release.json

aws lambda update-function-code --function-name DataHandler \
  --zip-file fileb://previous-DataHandler.zip
aws lambda update-function-code --function-name studup-outbox-worker \
  --zip-file fileb://previous-studup-outbox-worker.zip
aws lambda wait function-updated --function-name DataHandler
aws lambda wait function-updated --function-name studup-outbox-worker
```

4. Verify:

```bash
curl -fsS https://openapi.studup.net/open-api/health
curl -fsS https://openapi.studup.net/open-api/job-categories
curl -fsS -o /dev/null -w '%{http_code}\n' https://www.studup.net/
```

5. Frontend rollback: download the previous `frontend-build` artifact from the last
   known-good run (14-day retention), or rebuild that exact commit, then:

```bash
aws s3 sync build/ s3://studup-website/ --delete
aws cloudfront create-invalidation --distribution-id E3QIPLNGFSS6DH --paths '/*'
```

If the artifact is gone, restore individual objects from S3 versioning (below) or
rebuild the named commit; do not deploy an unverified local build.

6. Record the exact artifact SHA-256, `release.json` commit, Lambda `CodeSha256`,
   rollback start/end, and post-rollback smoke results. If the schema is not backward
   compatible with the previous Lambda, do **not** roll the code back alone; use the
   migration/forward-recovery procedure below.

## Migration failure

Migrations are forward-only Prisma migrations run by `studup-db-migrator` (`mode:
"migrate"`) before deploy. The runner is idempotent; never edit an applied migration or
delete rows from `_prisma_migrations` manually.

1. Read the failing invocation and the migrator logs:

```bash
aws logs tail /aws/lambda/studup-db-migrator --since 2h
aws lambda invoke --function-name studup-db-migrator \
  --cli-binary-format raw-in-base64-out \
  --payload '{"mode":"migrate"}' /tmp/migrate-response.json
cat /tmp/migrate-response.json
```

2. If the migration failed before committing, fix the SQL in a new migration, run the
   empty-database replay locally, then rerun `migrate`.
3. If the migration partially committed:
   - stop the deploy (the deploy job has `backend-migrate` concurrency and depends on
     validation, so a failed migrate blocks deploy);
   - capture `_prisma_migrations` rows, error text and the last good commit;
   - **OWNER ONLY:** restore a PITR instance to just before the migration (below) and
     repoint the application only after a data/privacy-owner decision. Otherwise write
     a forward-fix migration.
4. Record applied migrations, restore point, data-loss window and replayed verification.

The local reproduction command is:

```bash
pnpm database:migrate:deploy   # against a disposable local database
pnpm test:integration
```

## Database restore / point-in-time recovery

`dev` is PostgreSQL with 30-day automated backups, a daily backup window
`05:46–06:16 UTC`, Multi-AZ, deletion protection and final snapshot
`studup-dev-final`. PITR creates a **new** instance; do not restore in place.

**OWNER ONLY — production data step. Data/privacy owner approves the target time and
the acceptable data-loss window.**

```bash
aws rds describe-db-instances --db-instance-identifier dev \
  --query 'DBInstances[0].[LatestRestorableTime,BackupRetentionPeriod,MultiAZ]' --output text

# 1. Restore to a new instance, never over the live one.
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier dev \
  --target-db-instance-identifier studup-dev-pitr-$(date -u +%Y%m%d%H%M) \
  --restore-time 2026-11-08T09:00:00Z \
  --db-instance-class db.t3.micro \
  --no-publicly-accessible

# 2. Wait, then validate schema/migrations and representative reads on the new endpoint.
aws rds wait db-instance-available --db-instance-identifier <target-identifier>
```

After validation, the platform owner must decide whether to repoint the application
(update `APP_DATABASE_HOST`, redeploy/restart or update the Terraform variable) or copy
selected data forward. Keep the old instance until the incident record is closed. Record
the restore point, actual recovery time, data-loss window and verification queries.

## Secret rotation

### RDS master password (`studup-database-password`)

The rotation Lambda `studup-db-password-rotation` runs every 30 days and updates the RDS
master user `postgres`. It is invoked by Secrets Manager; never call the four rotation
steps manually out of order.

```bash
aws secretsmanager describe-secret --secret-id studup-database-password \
  --query '{rotation:RotationEnabled,last:LastRotatedDate,next:NextRotationDate}'
aws secretsmanager rotate-secret --secret-id studup-database-password   # OWNER ONLY
aws logs tail /aws/lambda/studup-db-password-rotation --since 30m
```

If rotation fails, keep the previous `AWSCURRENT` version, do not delete versions, and
follow the rotation Lambda logs. The application uses the `studup_app` role, so a failed
master rotation does not immediately break API traffic; the migrator and the next
migration do depend on the master secret.

### Application DB password (`studup-app-database-password`) — OWNER ONLY

There is no automatic rotation for the app role. `bootstrap-app-role` deliberately
leaves an existing role password unchanged. Rotate as a coordinated change:

```bash
NEW_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
# Run as the master role (for example through the migrator/psql in the VPC):
#   ALTER ROLE studup_app WITH PASSWORD '<NEW_PASSWORD>';
aws secretsmanager put-secret-value \
  --secret-id studup-app-database-password \
  --secret-string "$NEW_PASSWORD"
unset NEW_PASSWORD
```

The backend refreshes cached secrets on its TTL and retries credential failures once;
allow up to five minutes, then verify `/health` and an authenticated read. Record the
rotation time and any failed requests during the overlap.

### JWT secret (`studup-jwt-secret`) — OWNER ONLY

Rotating this invalidates every issued access token (users must sign in again). Update
the secret, allow the backend TTL/cold start to load it, then verify login and a private
read. Do not rotate during an active incident unless compromise requires it.

### Brevo email key, VAPID keys and GitHub OIDC

- Brevo key: update `studup-email-api-key`; verify a password-reset/verification email
  from a disposable account. No long-lived AWS credential is involved.
- VAPID: rotating the key pair makes existing web-push subscriptions unable to decrypt;
  they must re-subscribe. Update both public and private secrets, allow the TTL, then
  verify a test notification and record the re-subscription impact.
- GitHub Actions uses main-branch-scoped OIDC roles from `github-oidc.tf`; there are no
  long-lived AWS deploy keys to rotate. If a repository variable or role is suspected,
  disable the role/workflow, review CloudTrail, and reissue through a reviewed Terraform
  change (owner-only apply).

## S3, CV and avatar recovery

Buckets: `stud-up-cv-files` (private CVs), `stud-up-profile-images` (avatars via
CloudFront `/images/*`), `studup-website` (SPA), `studup-root-redirect`. All have
versioning enabled; noncurrent versions expire after 30 days. CVs are never public;
download only through the backend's short-lived presigned URL.

Canonical keys:

- CV: `cv/<student-uuid>/cv.<pdf|doc|docx>`
- Avatar: `images/<student|employer>/<uuid>/profile-<version>.<jpg|png|webp>`

Recover an accidentally deleted/overwritten object:

```bash
aws s3api list-object-versions --bucket stud-up-cv-files \
  --prefix 'cv/<student-uuid>/cv.' \
  --query 'Versions[].{key:Key,version:VersionId,modified:LastModified,delete:IsDeleteMarker}'

aws s3api copy-object --bucket stud-up-cv-files \
  --key 'cv/<student-uuid>/cv.pdf' \
  --copy-source 'stud-up-cv-files/cv/<student-uuid>/cv.pdf?versionId=<version-id>'

# Avatars follow the same pattern.
aws s3api list-object-versions --bucket stud-up-profile-images \
  --prefix 'images/student/<uuid>/'
```

After restoring an object, confirm the database pointer (`students.cv`,
`students.profile_image_url` or `employers.profile_image_url`) still names that key and
verify an authenticated download / CloudFront image load. If the version is older than
30 days, the object is unrecoverable from versioning; clear the pointer or ask the user
to re-upload, and record the loss. Do not make the CV bucket public and do not copy CVs
to the website bucket.

## Post-incident record

Record at minimum:

- alarm name/source and first/last detection time;
- affected commit, Lambda `CodeSha256`, artifact SHA-256 and migration names;
- every production command with operator role and timestamp;
- recovery time and data-loss window (including PITR target);
- verification results and remaining owner-only follow-ups;
- notification/privacy decision when personal data was lost or exposed.
