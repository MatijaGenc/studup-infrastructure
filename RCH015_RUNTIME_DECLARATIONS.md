# RCH-015 — application runtime declarations

DataHandler and studup-outbox-worker now declare nodejs26.x, matching their current live runtime and backend release workflow. The obsolete runtime ignore_changes workaround is removed; application artifact bucket/key ownership remains with the release workflow. The installed AWS 6.70.0 provider supports this runtime.

Read-only Lambda metadata confirmed both functions are Active with LastUpdateStatus Successful on nodejs26.x. Full infrastructure quality checks and exact-commit CI are required before tracker completion. This source reconciliation does not run Terraform apply, change the authorizer, or apply unrelated state/database drift. Broader INF-001 state ownership/reconciliation remains separately tracked.
