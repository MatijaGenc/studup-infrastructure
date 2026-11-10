# StudUp Infrastructure

Terraform-managed AWS infrastructure for the StudUp platform. The tracked `.tf` files
are the source of truth for the intended infrastructure; a local plan or this README
does not prove what is deployed.

## Start here

- [docs/PROJECT.md](docs/PROJECT.md) — canonical versioned project map: repositories, source
  contracts, API boundaries, isolated test environments, quality gates, releases,
  rollback and known limitations.
- [docs/INCIDENT_RECOVERY_RUNBOOK.md](docs/INCIDENT_RECOVERY_RUNBOOK.md) — detection
  sources, deploy rollback, migration failure, DB PITR, secret rotation and S3/CV/avatar
  recovery, with owners and production-only commands.
- [docs/OWNERSHIP_MATRIX.md](docs/OWNERSHIP_MATRIX.md) — who owns each remaining drift
  exception, secret, log group, S3 bucket, SNS subscription and alarm, plus the open
  egress/logging/storage/state-lock/monitoring decisions.
- [docs/SLO_AND_ALERTING.md](docs/SLO_AND_ALERTING.md) — draft availability, latency,
  error, DB-pool and job-delivery objectives with proposed burn rules, routing
  placeholders, the missing crash-reporting decision and the live drills still required.
  Not ratified and not live.
- [docs/STATUS_GUIDE.md](docs/STATUS_GUIDE.md) — how this project distinguishes
  implemented, validated, merged, deployed and live-verified work.
- [docs/chatgpt-tasks.md](docs/chatgpt-tasks.md) — canonical published task ledger
  snapshot. The editable master lives outside Git.
- [docs/archive/infrastructure-readme-2026-11-06.md](docs/archive/infrastructure-readme-2026-11-06.md)
  — historical README (captured 2026-11-06). Do not use it for current setup or status.

## Requirements

- Node.js 26 and npm 11 (the versions used by `.github/workflows/validate.yml`)
- Python 3.12 for the quality virtualenv and rotation Lambda checks
- Terraform `>=1.6`
- AWS CLI with an authenticated profile for plan/apply work

## Setup and checks

```bash
npm ci
npm --prefix authorizer ci
python3.12 -m venv .venv-quality
.venv-quality/bin/pip install -r requirements-quality.txt
npm run prepare          # points Git at .githooks; no-op outside a checkout with .git
terraform init -backend=false -lockfile=readonly  # validation only, no remote backend
npm run check            # typecheck, format check, lint, build, terraform validate, tests
```

`npm run check` is read-only with respect to AWS: it does not run `terraform apply` or
change remote state. Do not run destructive tests or applies against production.

## Infrastructure layout

- Terraform roots: `providers.tf`, `variables.tf`, `data.tf`, `s3.tf`, `cloudfront.tf`,
  `lambda.tf`, `rotation-lambda.tf`, `api-gateway.tf`, `rds.tf`, `route53.tf`, `acm.tf`,
  `waf.tf`, `secrets-manager.tf`, `monitoring.tf`, `budget.tf`, `github-oidc.tf`,
  `migration.tf`, `outputs.tf`.
- Scripts: [scripts](scripts/) — hooks, quality checks, secret scan helpers and task
  ledger publication.
- CI and local gates: [.github/workflows](.github/workflows), [.githooks](.githooks).
- Quality policy: [QUALITY_GATES.md](QUALITY_GATES.md).
- Release/recovery and runtime records: [RELEASE_ROUTE_FIX.md](RELEASE_ROUTE_FIX.md),
  [RCH001_CORS.md](RCH001_CORS.md), [RCH015_RUNTIME_DECLARATIONS.md](RCH015_RUNTIME_DECLARATIONS.md),
  [CG001_VALIDATION.md](CG001_VALIDATION.md), [PRIVATE_CV_STORAGE.md](PRIVATE_CV_STORAGE.md).

## Deploy access

GitHub Actions uses OIDC roles from `github-oidc.tf` (main-branch scoped). Repository
variables such as `AWS_BACKEND_DEPLOY_ROLE_ARN` and `AWS_FRONTEND_DEPLOY_ROLE_ARN` are
configuration, not proof of a successful deployment. Treat deployment state as verified
only from the exact commit, workflow run and live check that name it.

## History

The previous README mixed dated August 2026 session logs with setup instructions. It is
preserved, with a historical banner and archive-relative links, at
[docs/archive/infrastructure-readme-2026-11-06.md](docs/archive/infrastructure-readme-2026-11-06.md).
