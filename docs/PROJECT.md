# StudUp project map and entry documentation

Status: dated 2026-11-06. This page records checked-in repositories, commands,
contracts and guardrails from the working tree. It does not claim deployment, legal
operator status, retention terms, code-signing identity, live provider delivery or
proven rollback. Proof is limited to the exact commit, workflow run or live check it
names.

## Project map

| Area           | GitHub repository                                                                               | Local checkout                | Stack                                                                                  | Package manager   |
| -------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- | ----------------- |
| Web            | [MatijaGenc/student-employer-frontend](https://github.com/MatijaGenc/student-employer-frontend) | `recheck-2026-11-01/web`      | React 19 + Vite 8, TypeScript, MUI, Zustand                                            | yarn 4.18.0       |
| Backend        | [MatijaGenc/student-employer-backend](https://github.com/MatijaGenc/student-employer-backend)   | `recheck-2026-11-01/backend`  | AWS Lambda handler + Prisma 7 + PostgreSQL, TypeScript                                 | pnpm 10.0.0       |
| Mobile         | [MatijaGenc/student-employer-mobile](https://github.com/MatijaGenc/student-employer-mobile)     | `recheck-2026-11-01/mobile`   | Expo SDK 58 + React Native 0.88.1, TypeScript                                          | yarn 4.18.0       |
| Shared         | [MatijaGenc/studup-shared](https://github.com/MatijaGenc/studup-shared) (`@studup/shared`)      | `studup-shared-release-build` | Zod contracts, enums and types (compiled JS)                                           | yarn 4.18.0       |
| Infrastructure | this repository                                                                                 | `.`                           | Terraform-managed AWS (S3, CloudFront, Lambda, API Gateway, RDS, WAF, Secrets Manager) | npm (lockfile v3) |

Web, backend and mobile declare Node `>=26`; all three pin the same
`@studup/shared` revision in their `package.json`
(`112e97841e8ced62e9a5dd843834fba988c89743`). Shared is a contracts package
(`main: dist/index.js`), not a native module.

## Source contracts and source of truth

- Shared Zod schemas/types are the cross-repository request/response contracts. Web,
  backend and mobile import the same pinned package; backend also generates its OpenAPI
  document from those schemas.
- Infrastructure resource definitions live in this repository's `.tf` files. Remote
  Terraform state is in S3 (see [README](../README.md)); `.terraform/` is only a
  provider/schema cache and does not prove deployed state.

## Task ledger publication

The editable task-ledger master is `<workspace>/chatgpt-tasks.md`, outside Git. The
canonical published snapshot is [chatgpt-tasks.md](chatgpt-tasks.md), generated
one-way by `npm run publish:tasks`. Local checkboxes are not remote proof. The
publisher refuses to overwrite its source, refuses `complete-tasks.md`, environment
files and logs, normalizes absolute workspace paths, labels unavailable local
evidence, and fails closed on credential-like content without printing values.
Publishing means: review the diff, run `npm run check`, then use the reviewed task-branch/main
workflow.

## Setup and package manager versions

From the checked-in lockfiles and `package.json` files:

- Infrastructure: Node 26 / npm 11. Run `npm ci`; authorizer dependencies with
  `npm --prefix authorizer ci`; create Python 3.12 with
  `python3.12 -m venv .venv-quality` then
  `.venv-quality/bin/pip install -r requirements-quality.txt`, then
  `terraform init -backend=false -lockfile=readonly` before validation.
- Web / Mobile: `yarn install --immutable`, then `yarn prepare` on a fresh checkout.
- Backend: `pnpm install --frozen-lockfile`, then `pnpm generate:types:orm`.
- Shared: `yarn install --immutable`. Its `prepare` script is
  `tsc && node scripts/install-hooks.cjs`; `yarn hooks:install` is also available.
  Yarn 4 does not run `prepare` automatically after install, so run it explicitly on a
  fresh checkout.

Installing hooks is required setup, but a green local hook run is not evidence that
remote CI or a deployment succeeded.

## Test environments and safety

- **Web E2E is isolated by construction.** `web/playwright.config.ts` calls
  `resolveE2EEnvironment()` from `web/e2e/support/e2e-environment.ts`. That resolver
  requires explicit `E2E_AUTH_API_URL` and `E2E_DATA_API_URL` values and rejects
  non-loopback hosts, credentials, query strings and fragments. `E2E_BASE_URL` defaults
  to `http://localhost:5173`; the generated web server is HTTP-only. There is no
  production fallback in the default config. Set the two API variables to disposable
  local fixtures before `yarn test:e2e`.
- `yarn test:styling` / `yarn check:ui` use `playwright.styling.config.ts` and in-page
  mocked fixtures; use them for styling/accessibility work that must not write data.
- Backend integration tests require a disposable local PostgreSQL database and the
  explicit `STUDUP_TEST_DATABASE_CONFIRM` guard. Never point them at a developer or
  production database.
- Do not run destructive automated tests against production. An environment variable
  chain that happens to point at production is not consent to write there.

## Quality gates

Each repository documents its own gates:

- Infrastructure: [QUALITY_GATES](../QUALITY_GATES.md). `npm run check` runs typecheck,
  read-only format check, lint, build, `terraform validate` and tests. It performs no
  apply or state change.
- Web: `yarn check`; extra UI checks with `yarn check:ui` (WCAG contrast + Playwright
  styling). `yarn test:e2e` is separate and requires the isolated environment above.
- Backend: `pnpm check`; integration tests need the disposable database guard.
- Mobile: `yarn check` (JS quality plus all-platform `expo export`). An export is not
  native proof. Per `mobile/QUALITY_GATES.md`, shared JS/styling/navigation/behavior
  changes also need Android and iOS simulator/device smoke tests; native dependency,
  Expo/RN upgrade, config-plugin, permission or native-build changes need both native
  builds; store releases need release builds plus physical-device critical flows.
- Shared: `yarn check` includes typecheck, format, lint, build, tests and consumer
  typecheck (`test:consumers`).

## Local native builds (review mode)

Mobile supports local native review builds without EAS authentication. Android requires JDK17 (`JAVA_HOME`) and an Android SDK (`ANDROID_HOME`); iOS requires Xcode and CocoaPods. The optional preparation directory must be new; each build helper can create its own isolated directory:

```bash
yarn review:prepare /tmp/studup-review-source-new
yarn build:review:android   # Android SDK API/build tools 36 + NDK 27.1.12297006
yarn build:review:ios       # Xcode + CocoaPods; unsigned simulator build
```

`build-native-review.sh` copies the checkout to a new directory outside the repository,
excludes secrets/credentials/native output, writes `native-review-source.json`, and
builds in `EXPO_PUBLIC_APP_ENV=review` against loopback fixture URLs. This proves local
compilation and basic execution only. EAS cloud signing, signed physical-device
acceptance, store submission and provider push delivery remain unverified. Do not claim
EAS/store success from a local review build. The current policy is local-only native
review; EAS jobs stay opt-in and require repository credentials/`EXPO_TOKEN`.

## API boundary

- Infrastructure hosts three API Gateway REST APIs: `dta-api-new`, `data-api` and
  `open-api-API` (see `api-gateway.tf`).
- Web reads `VITE_AUTH_API_URL` and `VITE_DATA_API_URL`.
- Mobile reads `EXPO_PUBLIC_AUTH_API_URL` and `EXPO_PUBLIC_DATA_API_URL` through the
  single client in `mobile/shared/api.ts`.
- Auth and data APIs remain separate surfaces. Shared Zod contracts define the expected
  payloads; a successful fixture call does not prove live provider or production
  behavior.

## Release, rollback and recovery pointers

- [INCIDENT_RECOVERY_RUNBOOK.md](INCIDENT_RECOVERY_RUNBOOK.md) — alarm sources,
  deploy rollback, migration failure, DB PITR, secret rotation and S3/CV/avatar
  recovery, including owner-only production steps.
- [RELEASE_ROUTE_FIX.md](../RELEASE_ROUTE_FIX.md) — routing/release fix notes.
- [github-oidc.tf](../github-oidc.tf) and [README](../README.md) — main-branch-scoped
  GitHub OIDC deploy roles.
- [.github/workflows/validate.yml](../.github/workflows/validate.yml) and
  [.githooks/pre-push](../.githooks/pre-push) — CI and local gate enforcement.
- [RCH001_CORS.md](../RCH001_CORS.md), [RCH015_RUNTIME_DECLARATIONS.md](../RCH015_RUNTIME_DECLARATIONS.md),
  [CG001_VALIDATION.md](../CG001_VALIDATION.md) — runtime/CORS/validation records.

Deployment records identify a commit and artifact; rollback must name the exact
previous artifact used. Migration changes additionally require an empty-database
replay, representative-data compatibility and a documented rollback/forward recovery
plan. These gates do not authorize resetting or baselining production.

## Known limitations

- The editable task master and local reconciliation reports remain outside Git;
  local-only evidence is not remote proof.
- This documentation records checked-in commands and configuration only. It does not
  assert a legal operator, data-retention terms, code-signing identity, live signed
  provider/push delivery, store acceptance or proven rollback.
- The historical infrastructure README is archived at
  [docs/archive/infrastructure-readme-2026-11-06.md](archive/infrastructure-readme-2026-11-06.md).
  Its August 2026 session claims must not be reused as current status.
- Credential inventories referenced by SEC-001 are redacted from current docs. Do not
  copy credentials into documentation, fixtures or task records; owner revocation
  remains a SEC-001 responsibility.
