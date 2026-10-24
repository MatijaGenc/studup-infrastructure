# S-098 — API route deployment and JWT authorizer

The live public API stage `default` had deployment `u6j03u` (export dated 21 August 2026) with only `/` and `/open-api`. Configured `/{proxy+}` existed but had never been deployed. Add a deployment trigger covering methods, integration URIs and API configuration so future REST changes actually activate.

The deployed authorizer matched the repository source. It read headers for a TOKEN event (which supplies `authorizationToken`), read JWT `sub` instead of the backend's nested `user.id`, and returned a policy limited to one method despite token caching. The replacement verifies HS256, extracts the actual backend user and returns a policy restricted to the same API/stage. Individual backend handlers remain responsible for role and ownership checks. Missing/invalid/expired tokens stay denied.

Validation: authorizer syntax/typecheck/four node tests/package build; Terraform format and validation with backend disabled. No unrelated Terraform apply is needed for this repair. Keep the pre-change Lambda ZIP and public deployment ID for rollback. Deploy the authorizer ZIP, flush the private API authorizer cache, and activate the public API's already-configured routes. Verify public codebooks/health and unauthenticated private rejection.

The infrastructure Git remote contained an embedded access token. It was removed from the remote URL; rotate that credential. Do not put token values into reports, remotes or logs.

## Live deployment — 24 October 2026

User approved deploying commit `2459066`. The authorizer code update completed successfully at 20:22 UTC; private API `a5ljx6xmme/default` authorizer cache was flushed. Public stage deployment changed from `u6j03u` to `6gq3sa`.

Verification: unauthenticated requests to `userapi.studup.net` return 401. Public REST routes now reach the deployed API but return 403 because the existing resource policy contains only an HTTP denial and no HTTPS allow. A follow-up Terraform change adds an HTTPS-only allow on the public API, preserving the HTTP denial. Format and Terraform validation pass. Automatic approval review rejected applying this additional policy change because it was outside the earlier explicit approval; separate user approval is pending. Public REST restoration is therefore incomplete. No successful authenticated production login has been verified.

The user subsequently approved the HTTPS policy correction. It was applied and activated in deployment `ovd6wx`. A missing DataHandler invocation permission then caused gateway 500s; the API/account-scoped `StudUpPublicRestProxyInvoke` permission was added and represented in Terraform. Live checks now pass: `/universities` 200 (142 entries), `/job-categories` 200 (12 entries), `/health` 200. Anonymous `/users/data` remains 401. The earlier approval block is resolved.
