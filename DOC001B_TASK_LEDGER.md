# DOC-001-B — versioned task-ledger publication

Status: implemented, corrected after focused review and locally verified on 2026-11-05.
Not committed, pushed or deployed. Branch: `DOC-001-B-task-ledger`, created from
`origin/main` (`1bee9b7`).

## Delivered

- [docs/chatgpt-tasks.md](docs/chatgpt-tasks.md) is the canonical, versioned published
  task-ledger snapshot. It is linked from [README.md](README.md) and
  [docs/PROJECT.md](docs/PROJECT.md#task-ledger-publication).
- `scripts/publish-chatgpt-tasks.cjs` (`npm run publish:tasks`) performs one-way
  publishing from the local workspace master to `docs/chatgpt-tasks.md`. The default
  source is `../chatgpt-tasks.md` (workspace root) and an explicit source path may be
  passed as the only positional argument.
- The generated header records the source SHA-256 and publication date. The original
  task body, headings, tables, checkboxes and status text are preserved except for
  portable path/link normalization.
- Workspace absolute paths become `<workspace>/...`. Local-only evidence links become
  labelled plain text (`local evidence: ... (not published)`) instead of fake remote
  proof or broken relative Markdown links. Available in-repository targets are
  rewritten relative to `docs/`.
- The command refuses to overwrite the source, refuses `complete-tasks.md`, `.env`
  files and logs, and fails closed without printing values when credential-like
  patterns are detected in either the source or generated output. Source validation
  checks both the supplied path and its resolved real path before reading, so a
  Markdown symlink cannot alias a refused file. Publish sources must be non-empty
  Markdown files containing a Markdown title.
- Credential scanning also rejects password-bearing connection URLs for common
  schemes such as `postgres`, `mysql` and `http`, including short passwords, without
  printing the matched URL or password.
- Published dates are checked by calendar round-trip, so impossible dates such as
  `2026-02-31` are rejected instead of being normalized by `Date.parse`.
- `scripts/publish-chatgpt-tasks.test.cjs` adds eleven dependency-free fixture tests
  covering missing/invalid/refused sources, symlink and non-Markdown/empty/titleless
  source rejection before reading, source/output alias safety, deterministic header
  and body preservation, path/link portability, credential and connection-URL
  rejection without value disclosure, invalid calendar dates, and argument parsing.
  The tests run in `npm run test:gates`.

## Proof

- Initial implementation snapshot source SHA-256 (later snapshots record their own digest in the generated header):
  `6dfee35e3b117296d85185c9c1cdc2029f4a1d3b1cf8aa611f09ba104b0c4915`.
- Source checkboxes preserved (165 open, 390 checked); no `/Users/` path remains;
  zero non-remote Markdown links remain; zero broken relative links; source and output
  credential scans found nothing.
- `node --test scripts/publish-chatgpt-tasks.test.cjs`: 11/11 pass.
- `npm run check`: all configured gates pass, including typecheck, format check, lint,
  builds, Terraform validation and 22/22 gate tests. Logs are in the local workspace
  folder `recheck-fixes-2026-11-05/DOC001B/review/` (outside this repository):
  `focused-tests-corrections.log`, `npm-check-corrections.log`, and the corresponding
  exit-status logs.
- The generated snapshot was not rewritten: the publication output for non-secret
  master content is unchanged, and the real working master was not read or modified
  during this correction pass.

## Limits

- The snapshot reflects the local master at publication time. The master can change as
  other tasks finish; the coordinator must refresh and review the generated snapshot
  before publishing it.
- Local evidence is not remote proof. CI runs, deployments and live checks remain
  evidence only for the exact commits they name.
- No commit, push, Terraform apply, production action, Mac accessibility control or
  other-repository edit was performed.
- Local `main` was not fast-forwarded because it is checked out in another clean
  worktree; this branch was created directly from the fetched `origin/main` instead.
