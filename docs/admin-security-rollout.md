# Admin security enforcement rollout

Status: proposed rollout procedure. This document describes configuration only. It is
not evidence of a deployment, and no `terraform plan`, `terraform apply`, AWS access or
frontend/backend release was performed for it.

## Scope

The DataHandler Lambda reads two environment flags directly from `process.env`:

| Terraform variable               | Lambda environment variable          | Allowed values              | Default         |
| -------------------------------- | ------------------------------------ | --------------------------- | --------------- |
| `admin_reason_enforcement`       | `APP_ADMIN_REASON_ENFORCEMENT`       | `compatibility` or `strict` | `compatibility` |
| `admin_confirmation_enforcement` | `APP_ADMIN_CONFIRMATION_ENFORCEMENT` | `compatibility` or `strict` | `compatibility` |

Terraform validates both values. Only `aws_lambda_function.data_handler` receives these
variables; the authorizer and outbox worker do not need them.

`compatibility` preserves the current behaviour and is the default, so the Terraform
change is additive and backwards compatible. `strict` makes the backend reject admin
mutations that omit the required reason or confirmation proof. Existing JWT, role and capability checks remain enforced; strict mode additionally requires a reason and recent-password proof. The flags do not enable a pay floor.

## Rollout sequence

Run the steps in order. Do not set either flag to `strict` before the backend and web
prerequisites are verified in the target environment.

1. **Deploy the backend in compatibility mode.**
   - Release backend code that exposes the compatibility APIs and migrations for admin
     reasons and confirmation proof.
   - Keep both flags at `compatibility`.
   - Verify the migrations completed. Only legacy mutations may omit reasons in compatibility mode; new mutation endpoints always require reasons. Omitted proof is accepted only in compatibility mode, and supplied invalid proof is rejected in both modes.

2. **Deploy and verify the latest web client.**
   - Release the web client that submits a reason and confirmation proof for every admin
     action that will be enforced.
   - Verify successful admin actions through the web client against the compatibility
     backend, including persistence of the reason and proof.
   - Confirm no intended admin flow still relies on the compatibility fallback.

3. **Deliberately apply both strict values.**
   - Set both Terraform variables to `strict` through the normal reviewed change
     process. For example, in the environment-specific variable file or CI variable
     source:

     ```hcl
     admin_reason_enforcement       = "strict"
     admin_confirmation_enforcement = "strict"
     ```

   - Review the plan and apply it through the normal release process. This document does
     not authorise an apply.
   - Change both flags together unless a staged rollout has been separately reviewed.

4. **Verify strict enforcement.**
   - Submit an admin mutation without a reason and confirm it is rejected.
   - Submit an admin mutation without confirmation proof and confirm it is rejected.
   - Submit an admin mutation with both fields and confirm it succeeds and that the
     reason and proof are recorded.
   - Confirm the DataHandler environment contains `APP_ADMIN_REASON_ENFORCEMENT=strict`
     and `APP_ADMIN_CONFIRMATION_ENFORCEMENT=strict`.

## Rollback

Set the affected Terraform variable back to `compatibility` and apply it through the
normal release process, then repeat the step 4 checks. Rolling back the backend code
alone is not sufficient if the deployed environment still carries `strict`.

## Pay floor

The actual pay floor remains disabled until it is independently configured. These
enforcement flags do not enable pay enforcement and must not be treated as a pay-floor
activation switch. Reason and confirmation enforcement can be rolled out independently
of any pay-floor decision.

## Evidence to record

For each environment, record the reviewed plan/apply identifier, the deployed backend
and web release identifiers, the verified admin actions (accepted and rejected), and the
observed Lambda environment values. Keep the evidence with the release record rather
than editing this document.
