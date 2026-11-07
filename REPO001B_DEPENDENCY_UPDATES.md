# REPO001-B — Dependabot dependency updates

Baseline: `43fa6bb` (`DOC-001-A: Add cross-repository project entry guide`), clean.
Scope: configuration only. No dependency installs, version updates, Terraform/resource/state changes, workflow permission changes, or commits.

## Inspected manifests and existing automation

| Ecosystem      | Directory            | Manifest(s) found                                         |
| -------------- | -------------------- | --------------------------------------------------------- |
| npm            | `/`                  | `package.json`, `package-lock.json`                       |
| npm            | `/authorizer`        | `authorizer/package.json`, `authorizer/package-lock.json` |
| pip            | `/`                  | `requirements-quality.txt`                                |
| pip            | `/rotation-function` | `rotation-function/requirements.txt` (hash-pinned)        |
| terraform      | `/`                  | root `*.tf`, `.terraform.lock.hcl`                        |
| github-actions | `/`                  | `.github/workflows/validate.yml` (SHA-pinned actions)     |

No prior `.github/dependabot.yml`, Renovate config, or other dependency bot existed, so there is no bot conflict.

## Configured entries

Six weekly entries, each with `open-pull-requests-limit: 2` and a single `non-major`
version-update group (minor + patch). Major updates are deliberately left ungrouped, so
each major version bump opens its own individual PR for controlled, one-at-a-time review.

- npm `/` — root quality tooling
- npm `/authorizer` — authorizer Lambda
- pip `/` — `requirements-quality.txt`
- pip `/rotation-function` — rotation Lambda
- terraform `/` — providers/modules and lockfile
- github-actions `/` — pinned workflow actions

## Docs verification (checked 4 Nov 2026)

- [Supported ecosystems](https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories) states the pip ecosystem "supports updates to any `.txt` file", so `requirements-quality.txt` is covered. No unsupported-filename gap.
- [Terraform support](https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories#terraform) covers providers/modules and updates `.terraform.lock.hcl` when present.
- [Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference) confirms groups, schedules, and `open-pull-requests-limit`; GitHub Actions updates pinned action versions; npm uses the root/authorizer manifest and lockfile directories.
- [Grouped updates](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/optimizing-pr-creation-version-updates#grouping-dependabot-updates) confirms grouping by `update-types`; ungrouped major updates each produce an individual PR.
- Terraform has no security-update support per the [supported ecosystems](https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories) page; this config requests version updates only.

## Safety constraints

No `registries`, no `insecure-external-code-execution`, no private-registry credentials, no `automerge`, no `ignore` rules (including for major or security updates), no workflow/permission edits, and no external-code-execution permissions. Major updates are not ignored; they simply remain ungrouped so each opens its own PR.

## Validation

- `.github/dependabot.yml` parsed successfully with the available YAML parser (Ruby Psych 5.3.1) after removing the `major` groups; all six entries, weekly schedules, limit `2`, and the single `non-major` group were verified programmatically.
- Scoped configuration check confirms no `major` group and no `ignore` rules remain; unmatched major updates will open individual PRs.
- The existing `npm run check` passed earlier; the coordinator will rerun the full check before any push.

## Policy and unverified items

- VM/repo Dependabot enablement, first scheduled run, and platform settings/rollout are unverified.
- Terraform update PRs require a reviewed `terraform plan`; no apply is performed or implied.
- Hash-pinned `rotation-function/requirements.txt` updates still need the normal build/package validation.
- License policy and other repositories are separate follow-ups.
- Major updates are reviewed individually; no batching, auto-merge, or ignore rules apply.
