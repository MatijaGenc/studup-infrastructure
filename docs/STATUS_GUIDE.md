# Status and completion guide

Status: dated 2026-11-06. Applies to the task ledger and documentation in this
repository. A status word is only as strong as the evidence that names it.

## State definitions

| State             | Means                                                     | Minimum evidence                                                                |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Implemented**   | Code/config exists in a working tree or branch.           | Exact file paths, commit or diff. No claim beyond "written".                    |
| **Validated**     | The implemented slice passed the applicable local checks. | Command names/results and the exact commit; note skipped or unavailable checks. |
| **Merged**        | The validated commit is on the named shared branch.       | Remote branch/merge commit or PR identifier verified independently.             |
| **Deployed**      | The merged artifact was published by the deploy path.     | Workflow/deploy record naming the commit and artifact; environment named.       |
| **Live verified** | A live check against the deployed artifact passed.        | Time, environment, check and observed result tied to the deployed commit.       |

Implemented does not imply validated; validated does not imply merged; merged does
not imply deployed; deployed does not imply live verified. Never collapse these into a
single "done" claim.

## Counting rules

- Counts are per **primary task ID**, not per checkbox, slice, PR, comment or evidence
  link.
- A primary task counts as complete only when **all** of its acceptance criteria are
  satisfied at the required state. A checked slice never moves an unmet criterion into
  the complete count.
- If criteria are rewritten, split or renamed, keep the original primary ID and record
  the change. Do not create a fresh ID to make an old unmet criterion disappear.
- Partial work is reported as partial, with the parent ID and the specific remaining
  criteria. A child/delivery entry is an annotation, not a new completion unit.
- Do not count local ledger checkmarks as merged or deployed. The canonical published
  snapshot and remote evidence are separate.

## Owner-blocked versus actionable

- **Actionable**: the next step can be taken from the current checkout/accounts without
  another owner granting access, credentials or a decision.
- **Owner-blocked**: progress requires a named external action (credential, account,
  signing identity, provider console, legal/retention decision, production access,
  store review). Record the exact owner action and what remains unverified; do not
  mark the criterion validated by substituting a local fixture.
- Blocked work stays visible in the open count. "Blocked" is not a completion state.
- Do not use a documentation edit to retire an owner-blocked runtime criterion.

## Evidence hygiene

- Link exact source paths, tests and quality documents for implemented/validated work.
- Prefer commit-pinned links; branch links drift. Mark local-only paths clearly and do
  not present them as remote proof.
- Never include credentials, tokens, secret values or historical completion logs in
  status records. SEC-001 owns credential inventory/redaction and owner revocation.
- A Markdown/link/secret check is a documentation gate, not proof of a deployment.

## Applying this guide to DOC-001

The five DOC-001 acceptance criteria are content/documentation criteria at primary ID
level. Completing this content review can support **implemented/validated
documentation**; it must not be described as merged, deployed or live verified until
the exact branch, CI and deployment evidence exists. Runtime facts such as signed
provider delivery, push, store acceptance, legal operator, retention and rollback stay
open unless their own evidence satisfies the table above.
