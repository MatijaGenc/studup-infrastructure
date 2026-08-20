# StudUp Infrastructure

Terraform-managed AWS infrastructure for the StudUp platform.

## Resources Managed

| Service | Resource | Region |
|---------|----------|--------|
| **S3** | `studup-website` (frontend hosting) | eu-south-1 |
| **S3** | `stud-up-profile-images` (user images) | eu-south-1 |
| **CloudFront** | CDN for `www.studup.net` | us-east-1 |
| **Lambda** | `DataHandler` (Node.js 24) | eu-south-1 |
| **Lambda** | `studup-db-password-rotation` (Python 3.12) | eu-south-1 |
| **API Gateway** | `dta-api-new`, `data-api`, `open-api-API` | eu-south-1 |
| **RDS** | PostgreSQL `dev` (db.t3.micro, Multi-AZ, backups 30d) | eu-south-1 |
| **Route53** | `studup.net` hosted zone | - |
| **ACM** | `*.studup.net` + `www.studup.net` + `studup.net` certs | eu-south-1 / us-east-1 |
| **WAF** | Rate limiting (100 req/5min per IP) on all 3 API Gateways + CloudFront WAF (AWS managed rules: common, SQLi, XSS) | eu-south-1 / us-east-1 |
| **Secrets Manager** | DB password, JWT secret, email API key, VAPID keys | eu-south-1 |
| **Secrets Rotation** | DB password rotation every 30 days via Lambda | eu-south-1 |
| **VPC** | Default VPC + `lambda-rds-sg` security group + S3 Gateway Endpoint + Postgres ingress rule | eu-south-1 |
| **Budgets** | Monthly cost budget ($30) with email alerts at 80% and 100% | us-east-1 |
| **IAM** | Lambda role + S3 profile images policy + rotation Lambda role | eu-south-1 |
| **Monitoring** | SNS topic `studup-alarms` + CloudWatch alarms (API 5xx, Lambda errors, health check failure) | eu-south-1 |
| **CloudWatch** | WAF logging + health check metric filter | eu-south-1 / us-east-1 |

## What's Been Done (Sessions through 2026-08-20)

### A-018: Fix SSL Certificate Validation in Terraform
- Added DNS validation Route53 records + `aws_acm_certificate_validation` resources for all 3 ACM certs:
  - `*.studup.net` (eu-south-1) — was missing entirely
  - `studup.net` (eu-south-1) — already present
  - `www.studup.net` (us-east-1) — was missing entirely
- API Gateway domain names updated to reference validated cert ARNs via `aws_acm_certificate_validation.studup_wildcard.certificate_arn`
- CloudFront updated to reference validated cert ARNs via `aws_acm_certificate_validation.www_studup.certificate_arn`

### Cross-Project Fixes
- **@studup/shared alignment**: All 3 projects (backend, frontend, mobile) now pinned to the same commit `99450a3`
- **Biome 2.5.9**: All 3 projects updated to use Biome 2.5.9 (was mixed 2.5.6/2.5.9)
- **CI SSH auth fix**: `github:` shorthand deps now resolve via HTTPS in CI instead of SSH

### Frontend (student-employer-frontend)
- **Build warnings**: Fixed font/image path resolution (root-relative `/resources/` paths), `chunkSizeWarningLimit` raised
- **Zustand**: Migrated from deprecated `create` to `createWithEqualityFn`
- **React Router**: Added `v7_startTransition` + `v7_relativeSplatPath` future flags to `BrowserRouter` + all `MemoryRouter` instances in tests
- **@mui/x-date-pickers**: Upgraded from `^6.4.0` to `^7.23.0` for React 19 compatibility
- **Peer deps**: Added explicit `@mui/system`, `prop-types`, `clsx` to satisfy peer dependencies
- **@studup/shared**: Regenerated `yarn.lock` so `github:` shorthand resolves via HTTPS
- **Tests**: 24/24 passing — zero warnings in stderr

### Backend (student-employer-backend)
- **Biome**: Fixed `package.json` formatting in lint-staged config
- **@studup/shared**: Pinned to full commit hash with HTTPS git dependency
- **Lambda deploy**: Fixed race condition — `wait function-updated` between `update-function-code` and `update-function-configuration`, skips runtime update if already correct
- **Prisma**: Attempted upgrade 5.22.0 → 7.9.1, but reverted (Prisma 7 requires `prisma.config.ts` and drops `url` from `schema.prisma` — planned for future task S-044)

### Mobile (student-employer-mobile)
- **Biome**: Fixed `package.json` formatting in lint-staged config
- **@studup/shared**: Pinned to full commit hash

## What's NOT Been Done / Known Issues

### Infrastructure (terraform plan NOT verified)
The cert validation changes in `acm.tf` were committed but `terraform plan` could **not** be run because AWS CLI authentication is broken. The `aws login` command opens a browser flow but the OAuth grant consistently fails with:
```
The provided authorization grant is invalid, expired, revoked, or malformed
```

**To fix**: Run `terraform plan` manually after reauthenticating via:
```bash
aws sso login
# or
aws configure  # with IAM access keys
cd ~/Projects/studup-infrastructure
terraform plan
```

### Prisma 7 Upgrade (S-044)
Blocked on breaking changes in Prisma 7 — it requires a `prisma.config.ts` file and removes `url` from `schema.prisma`. Needs a separate migration task.

### Punycode Deprecation Warnings
Node 26 deprecates the built-in `punycode` module. Transitive deps (`psl`, `uri-js`) still use it. These appear during tests as non-blocking stderr. Fix requires upstream package updates or `NODE_OPTIONS='--no-deprecation'`.

### Remaining
- **CAPTCHA on registration** (S-008) — optional
- **Sentry error tracking** (S-024) — SKIPPED (no Sentry account)
- **Lambda reserved concurrency** (S-018) — blocked by AWS account limit (10 concurrent execs)

### Backend (student-employer-backend) — Previous Sessions
- Secrets moved from Lambda env vars to Secrets Manager (fetched at cold start)
- JWT expiry reduced from 10 years to 15 min access + 7 day refresh tokens
- Error handling: no stack traces leaked to clients, custom error classes, sanitized messages
- Auth security: no user enumeration (generic error messages), rate limiting (in-app + WAF)
- Audit logging: all actions logged to DB + Pino
- Pagination + filters on job search (category, wage range, title text search, employer name, job type)
- Job alert backend trigger: matches new jobs against alerts, sends push notifications
- Push notification infrastructure: device token registration/unregistration, Expo Push API, web push (VAPID)
- Rating system: full CRUD (create/edit/delete), student + employer ratings, average recalculation, pagination
- Health check endpoint (pings DB, returns 200/503)
- OpenAPI spec generated from Zod schemas
- Fixes: StudentRating employer authorization, missing Prisma indexes, unique constraints, file upload validation (S3 + CloudFront)
- Tests: 199/199 passing (integration + unit)

### Frontend (student-employer-frontend) — Previous Sessions
- CI/CD pipeline (GitHub Actions)
- Code splitting (React.lazy): 71% reduction in initial bundle (1,324 kB → 379 kB)
- Auth security: httpOnly cookies for refresh tokens, CSP meta tag, tokens in Zustand memory
- Loading skeletons (shimmer animation) on all data-fetching components
- React Hook Form + Zod migration for all 9 forms
- Error boundary with Croatian fallback UI
- API error handling: `makeRequest` helper with 2 retries + exponential backoff
- Alert UI: create/edit/delete job alerts (max 3 per student)
- Web push notifications: service worker, Push API subscription/unsubscription
- Rate form UI: given/received ratings, edit/delete with confirmation
- PWA support: service worker, manifest, offline fallback
- Bug fixes: missing logo, empty category dropdown, logout state persistence
- Tests: 24/24 passing

### Mobile (student-employer-mobile) — Previous Sessions
- CI/CD pipeline (GitHub Actions + EAS preview/production)
- expo-secure-store for encrypted token storage
- LogBox: removed `ignoreAllLogs()`, targeted suppression only
- Rating system UI: given/received ratings, edit/delete
- Push notification registration on login, unregistration on logout
- Expo SDK upgraded to SDK 57
- Typecheck: clean

### Shared (studup-shared) — Previous Sessions
- Zod validation schemas, enums, types extracted to standalone package
- Imported by backend, frontend, and mobile — single source of truth
- Password policy standardized: min 8, max 50, 1 upper, 1 lower, 1 number

## What's NOT Been Done / Known Issues

### Infrastructure (terraform plan NOT verified)
The cert validation changes in `acm.tf` were committed but `terraform plan` could **not** be run because AWS CLI authentication is broken. The `aws login` command opens a browser flow but the OAuth grant consistently fails with:
```
The provided authorization grant is invalid, expired, revoked, or malformed
```

**To fix**: Run `terraform plan` manually after reauthenticating via:
```bash
aws sso login
# or
aws configure  # with IAM access keys
cd ~/Projects/studup-infrastructure
terraform plan
```

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.6
- AWS CLI configured with credentials for account `672791741750`
- [AWS SSO](https://docs.aws.amazon.com/cli/latest/userguide/sso-configure-profile-token.html) or access keys with sufficient permissions

## Quick Start

```bash
# 1. Export AWS credentials (SSO)
eval $(aws configure export-credentials --format env)

# 2. Load secrets from AWS Secrets Manager
source ./scripts/load-secrets.sh

# 3. Initialize (state stored in S3)
terraform init

# 4. See what would change
terraform plan

# 5. Apply changes
terraform apply
```

## First-Time Setup (Import Existing Resources)

If the infrastructure already exists in AWS, import it into Terraform state:

```bash
bash import.sh
terraform plan  # should show no changes
```

## Project Structure

```
studup-infrastructure/
├── providers.tf          # AWS providers + S3 backend
├── variables.tf          # Input variables
├── data.tf               # Data sources (VPC, subnets)
├── s3.tf                 # S3 buckets + versioning + encryption
├── cloudfront.tf         # CloudFront distribution + CSP headers
├── lambda.tf             # DataHandler Lambda + IAM role + SG
├── rotation-lambda.tf    # DB password rotation Lambda + IAM role
├── rotation-function/    # Rotation Lambda source code (Python)
│   ├── rotate.py
│   ├── build.sh
│   └── requirements.txt
├── rotation-function.zip # Pre-built rotation Lambda package
├── api-gateway.tf        # 3 REST APIs + custom domains
├── rds.tf                # PostgreSQL database (Multi-AZ)
├── route53.tf            # DNS zone + records
├── acm.tf                # SSL/TLS certificates
├── waf.tf                # Web ACL + associations
├── secrets-manager.tf    # Secrets + VAPID keys
├── monitoring.tf         # SNS alarms + CloudWatch metric filters
├── budget.tf             # Monthly cost budget + email alerts
├── outputs.tf            # Output values
├── import.sh             # Script to import existing resources
└── terraform.tfvars.example  # Variable template
```

## Making Changes

1. Edit the relevant `.tf` file
2. Run `terraform plan` to preview
3. Run `terraform apply` to apply

State is stored remotely in S3 (`studup-terraform-state`) — no manual state file management needed.

## Secrets

Secrets are never stored in version control:
- **Local**: `terraform.tfvars` (gitignored)
- **CI**: GitHub Actions Secrets
- **Production**: AWS Secrets Manager (Lambda fetches at cold start)