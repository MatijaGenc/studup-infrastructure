# StudUp project map and entry documentation

Status: dated 2026-11-04. Dated entry documentation for the StudUp platform and the
repositories around it. It records only what is checked in and verified from the
working tree; it does not claim deployment, legal, retention, signing or rollback
state that has not been verified. Infrastructure `main` is at commit `91aa33e`
(RCH-015) at the time of writing.

## Project map

| Area | GitHub repository | Local checkout | Stack | Package manager |
|------|-------------------|----------------|-------|-----------------|
| Web | [MatijaGenc/student-employer-frontend](https://github.com/MatijaGenc/student-employer-frontend) | `recheck-2026-11-01/web` | React 19 + Vite 8, TypeScript, MUI, Zustand | yarn 4.18.0 |
| Backend | [MatijaGenc/student-employer-backend](https://github.com/MatijaGenc/student-employer-backend) | `recheck-2026-11-01/backend` | AWS Lambda handler + Prisma 7 + PostgreSQL, TypeScript | pnpm 10.0.0 |
| Mobile | [MatijaGenc/student-employer-mobile](https://github.com/MatijaGenc/student-employer-mobile) | `recheck-2026-11-01/mobile` | Expo SDK 58 + React Native 0.88.1, TypeScript | yarn 4.18.0 |
| Shared | [MatijaGenc/studup-shared](https://github.com/MatijaGenc/studup-shared) (`@studup/shared`) | `studup-shared-release-build` | Zod schemas, enums and types (compiled JS) | yarn 4.18.0 |
| Infrastructure | this repository | `.` | Terraform-managed AWS (S3, CloudFront, Lambda, API Gateway, RDS, WAF, Secrets Manager) | npm (lockfile v3) |

All application repositories target Node `>=26` and share the same `@studup/shared`
Git dependency revision. The shared package (`main: dist/index.js`) is consumed as
compiled JavaScript; it is a contracts package, not a native module.

## Source of truth

- Web contracts consumed from `@studup/shared` (Zod schemas/types).
- Backend `@studup/shared` revision is pinned in `backend/package.json`; web and
  mobile pin the same `github:MatijaGenc/studup-shared#<sha>` revision.
- Infrastructure resource definitions live in the `.tf` files in this repository.
  Remote Terraform state is stored in S3 (see [README](../README.md)); the local
  `.terraform/` directory is only provider/schema cache and does not prove what is
  deployed.

## Setup and package manager versions

Per-repository, from the committed lockfiles:

- Infrastructure (this repo, npm 11 / Node 26):
  `npm ci` and `npm --prefix authorizer ci`; create Python 3.12 with
  `python3 -m venv .venv-quality` then `.venv-quality/bin/pip install -r requirements-quality.txt`.
- Web / Mobile / Shared (yarn 4.18.0): `yarn install --immutable`.
- Backend (pnpm 10.0.0): `pnpm install --frozen-lockfile` then `pnpm generate:types:orm`.

### Fresh checkout: `yarn prepare`

Yarn 4 does not run `prepare` automatically after install. On a fresh Git checkout
run `yarn prepare` explicitly (web, mobile, shared) to install the commit hook;
Husky in the app repositories does the same. For this infrastructure repository
(`npm`) the `prepare` script runs `node scripts/install-hooks.cjs`, which points
Git at `.githooks` only when the checkout has its own `.git`. Installing the hook
is required setup, but a green local run is not evidence that remote CI or a
deployment succeeded.

### JavaScript exports are not a native build

Mobile `build` / `build:bundle` run `expo export` (JS and assets) and validate the
bundle only. They do **not** compile, install or prove native Android/iOS binaries,
and an export is never proof on its own. Native validation is separate: EAS preview
builds (`build:native:android`, `build:native:ios`) require the EAS CLI and an
authenticated Expo account with configured credentials. **Cloud signing via EAS
remains unverified until that authentication exists** — but this does not make a
native build impossible: a local native build using the Android SDK/JDK or Xcode is
a valid build without EAS, and local native builds/tests can pass. Distinguish proof
levels: a local unsigned simulator/emulator build and run proves the app compiles and
basic flows execute, while **signed physical-device acceptance is separate and still
unverified here**. The documented policy is local native builds only for now, with no
EAS authentication.

## API boundary and synthetic local testing

The checked-in API surface and clients:

- Infrastructure hosts three API Gateway REST APIs: `dta-api-new`, `data-api`,
  `open-api-API` (see [README](../README.md) and `api-gateway.tf`).
- Web reads `VITE_AUTH_API_URL` and `VITE_DATA_API_URL`. Its default Playwright E2E
  config (`web/playwright.config.ts`) points at `https://openapi.studup.net/open-api`
  and `https://userapi.studup.net/data-api`; the backend CORS allow-origin is
  `https://www.studup.net`. These are production-shaped hosts and the default E2E
  run may therefore reach production.
- Dedicated synthetic paths exist for local, non-production UI checks:
  `web/playwright.styling.config.ts` serves `http://127.0.0.1:5175` and routes
  `http://127.0.0.1:5175/__styling_api/**` to in-page mocked fixtures. Run
  `yarn test:styling` (and `yarn check:ui`) rather than the default E2E config when
  the goal is styling/accessibility verification.

Never run destructive automated tests against production. Use the synthetic
styling configuration, disposable local databases and mocked fixtures. The default
E2E endpoints are not a safe write target.

## Quality gates

Each repository documents its own gates in its checked-in `QUALITY_GATES.md`:

- This repository: [QUALITY_GATES](../QUALITY_GATES.md). One command, `npm run check`,
  runs the configured gates in order (typecheck, read-only format check, lint,
  build, `validate:terraform`, tests). It performs no apply and no state changes.
- Web: `yarn check`; UI extras via `yarn check:ui` (contrast + Playwright styling).
- Backend: `pnpm check`; integration tests need a disposable local PostgreSQL
  database (`STUDUP_TEST_DATABASE_CONFIRM`) and never a developer/production DB.
- Mobile: `yarn check` (JS quality plus all-platform `expo export`). An export alone is
  never complete proof. Per the mobile matrix in `mobile/QUALITY_GATES.md`: shared JS,
  styling, navigation or behavior changes also require actual Android and iOS
  simulator/device smoke tests of the affected flows; native dependency, Expo/RN
  upgrade, config-plugin, permission or native-build-config changes require both
  Android and iOS native builds; store releases require both native release builds
  plus physical-device critical-flow tests.

## Release and recovery pointers

- [RELEASE_ROUTE_FIX.md](../RELEASE_ROUTE_FIX.md) — routing/release fix notes.
- [github-oidc.tf](../github-oidc.tf) and [README](../README.md) — GitHub OIDC deploy
  roles (`studup-github-backend-deploy`, `studup-github-frontend-deploy`), main-branch
  scoped.
- [.github/workflows/validate.yml](../.github/workflows/validate.yml) and
  [.githooks/pre-push](../.githooks/pre-push) — CI and local gate enforcement.
- [RCH001_CORS.md](../RCH001_CORS.md), [RCH015_RUNTIME_DECLARATIONS.md](../RCH015_RUNTIME_DECLARATIONS.md),
  [CG001_VALIDATION.md](../CG001_VALIDATION.md) — runtime/CORS/validation records.

Migration changes additionally require an empty-database replay, representative-data
compatibility and a documented rollback/forward recovery plan; these gates do not
authorize resetting or baselining production.

## Known limitations (DOC-001 gap)

- Master tracking files `chatgpt-tasks.md` and the latest reconciliation report
  `recheck-report-2026-11-04.md` are currently local workspace files **outside Git**;
  they are not published in any repository. They are referenced here as a workspace
  convention, not as a claim that they are version-controlled.
- This documentation records checked-in commands and configuration only. It does not
  assert verified deployed state, a legal operator, data retention terms, code-signing
  identity, or proven rollback. Those remain open items.
- Completing DOC-001 in full is out of scope for this entry document; this page closes
  only the entry-documentation portion and should not be read as full DOC-001 sign-off.
