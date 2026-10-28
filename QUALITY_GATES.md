# Quality gates

Use Node 26 and npm 11. Install from the committed lockfile, then run `npm run check` from this repository root. The command runs typecheck, read-only formatting, lint, build and tests in order; any failure stops the chain and returns a nonzero exit code. Format/lint checks never rewrite source. Run an explicit formatting command separately when fixing a failure.

CI calls the same command. The pre-push hook runs it for code updates, including main; deletion-only updates contain no code to validate. Install dependencies to install the hook (Husky in app repositories; `prepare` in shared/infrastructure). Do not bypass hooks or treat a local pass as evidence that remote CI/deployment succeeded.

`test:gates` injects real failing child processes at each of the typecheck/lint/build/test positions, verifies later commands stop, rejects missing configuration/executables, and exercises the actual hook with a failing package manager and deletion-only input. These tests verify failure propagation; they supplement each tool's normal checks.

Before marking a task done, attach its commands, outcomes, test counts, relevant platform/environment, and any inapplicable checks with reasons. Record implementation, local validation, push, CI, deployment and live verification separately. Review the diff and scan staged changes for secrets before push. UI, database, infrastructure and native changes also require the applicable checks below.

## Infrastructure and Lambda packages

Install Node dependencies using `npm ci` and `npm --prefix authorizer ci`. Use Python 3.12: `python3 -m venv .venv-quality` then `.venv-quality/bin/pip install -r requirements-quality.txt`. Initialize Terraform schemas using `terraform init -backend=false -lockfile=readonly` in a clean validation checkout, then run `npm run check`. Do not reconfigure an active production backend merely to validate.

Typecheck runs the authorizer's strict checkJs TypeScript configuration and mypy on rotation/packaging Python with untyped function bodies checked. Third-party SDK stubs are not required; this is gradual Python checking, not strict end-to-end SDK typing. Formatting checks Terraform, JS/JSON and Python; lint includes Biome and Ruff.

Build creates fresh Lambda ZIPs from hash-locked Python 3.12 runtime wheels (including transitives) and the npm runtime lockfile in temporary staging folders; installers must fail the build, stale ZIP entries are removed, and development TypeScript is excluded from the authorizer archive. Tests cover token policy, rotation guards/passwords, packaging and gate failure propagation without live AWS calls. Keep AWS credentials out of validation CI.

Terraform resource/provider changes additionally need a reviewed plan against the intended environment before apply. Tooling-only changes need validation and package tests; production plan/apply is inapplicable if no resource configuration changed. Native/mobile checks are inapplicable here. No quality command deploys resources. Package/runtime behavior changes need relevant compatibility and deployment verification separately.

Terraform semantic validation runs after package build because resource source hashes read the generated ZIP files. A clean checkout must build real archives before validating; placeholder ZIPs are not a valid substitute.
