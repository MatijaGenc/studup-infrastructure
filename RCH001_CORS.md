# RCH-001 — Private browser request headers

The web client attaches `Idempotency-Key` to mutations and the backend supports `X-Client-Type`, but the private API Gateway mock OPTIONS integrations allowed only the legacy three headers. Browser preflight therefore blocked the new request contract even though public login continued to work.

Gateway error responses and both private OPTIONS configurations now share a single allowlist: `Content-Type,Authorization,X-Access-Token,X-Client-Type,Idempotency-Key`. Existing exact private origin, credentials, supported methods, HTTPS policies and JWT protection remain enforced. Backend response headers already support this contract.

The authorizer/configuration regression fails on the old source and checks the shared contract, private OPTIONS, gateway errors and existing deployment dependencies. `npm run test:live-cors` is an opt-in, read-only HTTPS smoke: it sends OPTIONS for POST/PATCH/DELETE, checks origin/credential/header behavior, then confirms anonymous private GET still returns 401. It accepts additional `--base=https://...` arguments for the legacy execute-api stage.

## Release verification

- Run the complete infrastructure gates, including Terraform validation.
- Review a saved targeted plan; only the CORS response parameter maps may change. Do not apply unrelated Lambda, database or infrastructure drift.
- Save previous API deployment IDs/stage pointers before publishing gateway snapshots, enabling rollback to the prior snapshots.
- Verify live custom-domain and legacy preflight paths plus browser cross-origin access to an anonymous 401. A successful push/validation does not publish gateway changes.
- Record exact commit, plan summary, deployment IDs and live results in the workspace task ledger. Actual authenticated production accounts are not needed or exercised for the anonymous boundary check; the existing real-backend isolated job-creation journey verifies authenticated behavior separately.

Full infrastructure reconciliation, including the documented nodejs24.x/nodejs26.x runtime drift, remains under INF-001. This correction does not authorize applying that unrelated plan.
