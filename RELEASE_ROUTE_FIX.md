# S-098 — API route deployment and JWT authorizer

The live public API stage `default` had deployment `u6j03u` (export dated 21 August 2026) with only `/` and `/open-api`. Configured `/{proxy+}` existed but had never been deployed. Add a deployment trigger covering methods, integration URIs and API configuration so future REST changes actually activate.

The deployed authorizer matched the repository source. It read headers for a TOKEN event (which supplies `authorizationToken`), read JWT `sub` instead of the backend's nested `user.id`, and returned a policy limited to one method despite token caching. The replacement verifies HS256, extracts the actual backend user and returns a policy restricted to the same API/stage. Individual backend handlers remain responsible for role and ownership checks. Missing/invalid/expired tokens stay denied.

Validation: authorizer syntax/typecheck/four node tests/package build; Terraform format and validation with backend disabled. No unrelated Terraform apply is needed for this repair. Keep the pre-change Lambda ZIP and public deployment ID for rollback. Deploy the authorizer ZIP, flush the private API authorizer cache, and activate the public API's already-configured routes. Verify public codebooks/health and unauthenticated private rejection.

The infrastructure Git remote contained an embedded access token. It was removed from the remote URL; rotate that credential. Do not put token values into reports, remotes or logs.
