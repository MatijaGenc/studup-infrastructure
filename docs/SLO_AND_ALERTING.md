# SLO and alerting — draft for owner ratification

Status: **DRAFT. Proposed, not live, not ratified.** This page was written on
10 November 2026 from the Terraform configuration at main `7172d25`. No AWS
`describe-alarms`, metric query, drill or production command was run for it. **Every
objective, threshold, window, burn rule, routing label and pass criterion below is
proposed — owner ratification required.** Nothing here should be quoted as a current
service-level commitment or as proof that monitoring works.

The current README and runbook remain the source for what is actually configured:
[../README.md](../README.md), [INCIDENT_RECOVERY_RUNBOOK.md](INCIDENT_RECOVERY_RUNBOOK.md)
and [OWNERSHIP_MATRIX.md](OWNERSHIP_MATRIX.md).

## 1. What exists today

Derived from `monitoring.tf` and the Terraform resources it references:

- 11 static CloudWatch alarms route to the single `studup-alarms` SNS topic: three
  API-Gateway 5XX alarms, one DataHandler error alarm, one rotation-Lambda error alarm,
  one `/health` log-filter alarm, three RDS alarms, one outbox-worker error alarm and one
  outbox-delivery-failure alarm.
- Two log metric filters produce `StudUp/HealthCheckFailure` and
  `StudUp/OutboxDeliveryFailures`.
- The SNS topic has one email subscription and no KMS key. The runbook requires the
  recipient to confirm it; no confirmation or delivery drill is recorded.
- API Gateway stages have access logs and X-Ray tracing enabled. Lambda and RDS emit
  their default CloudWatch metrics.
- There is no dashboard, synthetic canary, error-budget policy, burn-rate alarm, pager
  integration, latency alarm or availability-ratio alarm.
- There is no client crash-reporting provider in this repository. The archived
  infrastructure README records Sentry as skipped for lack of an account.

Consequence: the existing alarms can detect several **symptoms**, but the project has no
ratified objective that says which symptom at which rate is a page, a ticket or a
release blocker. This document proposes that mapping without changing any resource.

## 2. Proposed objectives

Every value in this table is **proposed — owner ratification required**. The
"Measurement source" column names the metric that would be used; no query was run.
Rolling windows are calendar-month (30-day) windows unless stated otherwise.

| ID    | Objective                           | Proposed SLI definition                                                                                                                                  | Measurement source (existing telemetry)                                                                                                                                                           | Proposed threshold / target                                                                                                       | Proposed burn / alert rule                                                                                                                                                                                                                                    | Existing alarm that partially covers it | Routing owner (placeholder)                                           |
| ----- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| SLO-1 | API availability                    | Proportion of valid API requests that do **not** return a 5XX, measured separately for `data-api`, `dta-api` and `open-api-API`                          | `AWS/ApiGateway` `Count` and `5XXError` by `ApiName`/`Stage`; access logs for request IDs only, not for the ratio                                                                                 | **99.5 %** per API per 30 days (≈ 3 h 39 m unavailable)                                                                           | Page: 14.4× burn over 1 h **and** 5 m (2 % of monthly budget). Ticket: 6× burn over 6 h **and** 30 m (5 % of budget). No page from a single 5-minute blip unless the absolute 5XX rule also fires.                                                            | A-01, A-02, A-03 (absolute 5XX count)   | `<on-call-primary>` page; `<platform-owner>` escalation               |
| SLO-2 | API latency p95                     | 95th percentile of API Gateway `Latency` for successful requests, per API                                                                                | `AWS/ApiGateway` `Latency` p95 by `ApiName`/`Stage`; this is gateway-measured latency, **not** client-perceived end-to-end latency                                                                | **≤ 500 ms** p95 for `data-api` and `dta-api`; **≤ 300 ms** p95 for `open-api-API`, 30-day window                                 | Warning ticket: p95 > 1.5× target for 2 consecutive 5-minute periods. Page: p95 > 2× target or > 1 500 ms for 3 consecutive periods. Latency without elevated 5XX is a warning, not an availability incident.                                                 | None                                    | `<backend-owner>` page; `<platform-owner>` escalation                 |
| SLO-3 | API error rate                      | 5XX responses divided by all responses, excluding expected 4XX validation/auth failures                                                                  | `AWS/ApiGateway` `5XXError / Count` per API/stage; Lambda `Errors` for handler-level attribution                                                                                                  | **≤ 1 %** 5XX per API per 30 days; no 5-minute window above **5 %**                                                               | Page: > 5 % over 2 consecutive 5-minute periods **or** the existing absolute rule (> 5 5XX in 2 × 5 m). Ticket: > 1 % over 3 consecutive periods. A deployment-caused breach blocks further rollout until the release is rolled back or explicitly accepted.  | A-01 to A-04                            | `<backend-owner>` page; `<release-manager>` for deploy-caused breach  |
| SLO-4 | DB pool / connection pressure       | Average RDS `DatabaseConnections` as a share of the effective `max_connections` (the current t3.micro default is roughly 85, so 60 ≈ 70 % and 80 ≈ 94 %) | `AWS/RDS` `DatabaseConnections` Average for `dev`; `max_connections` is a parameter-group value, not a CloudWatch metric; idle-in-transaction checks require a read-only `pg_stat_activity` query | **No 5-minute average above 60**; **never above 80**; target headroom ≥ 25 % of `max_connections`                                 | Warning: average > 60 for 2 × 5 m (matches the existing alarm). Page: average > 80 for 2 × 5 m or any connection-refused errors. Investigate pool size/concurrency before adding replicas; pagination evidence already showed 11 sessions at the tested load. | A-08                                    | `<platform-owner>` page; `<backend-owner>` query/pool investigation   |
| SLO-5 | Job-alert delivery (outbox)         | Proportion of outbox notification events delivered successfully, and freshness of the worker                                                             | `StudUp/OutboxDeliveryFailures` from the `monitoring.tf` JSON log filter; `AWS/Lambda` `Errors`/`Invocations` for `studup-outbox-worker`; EventBridge schedule is every minute                    | **99.9 %** of outbox events delivered; **no event older than 5 minutes** waiting; **zero** failed deliveries in a 5-minute window | Page: any `OutboxDeliveryFailures > 0` (matches A-11) or any worker error (A-10). Page: no successful completion log for 10 minutes (new alarm proposed). Ticket: delivery p95 > 5 minutes for 15 minutes.                                                    | A-10, A-11                              | `<backend-owner>` page; `<platform-owner>` for schedule/worker health |
| SLO-6 | Alarm delivery (supporting control) | Proportion of test/real alarms that reach a human-acknowledged channel within the routing target                                                         | SNS `NumberOfNotificationsDelivered`/`NumberOfNotificationsFailed` (where available) plus the owner-recorded receipt time from the SNS drill; no pager acknowledgement telemetry exists yet       | **100 %** of drill publications received and acknowledged within **5 minutes**; no unconfirmed subscription                       | Page: failed SNS notification or drill receipt > 5 minutes. This is a control objective, not a customer SLO; it must pass before SLO-1 to SLO-5 can be trusted.                                                                                               | N-01, N-02 in the ownership matrix      | `<platform-owner>`; `<on-call-primary>` acknowledges                  |

Notes on the objectives:

- SLO-1 to SLO-3 use gateway metrics. They do not see client crashes, offline mobile
  use, DNS failures before the gateway, or CloudFront/S3 static-site errors.
- SLO-2 measures server-side p95. A separate client-side p95 would require RUM, which is
  not configured.
- SLO-4 cannot prove pool health from CloudWatch alone; the `max_connections` and
  idle-in-transaction parts need a read-only database query during an incident.
- SLO-5 depends on one exact log message (`Outbox worker completed` with `failed > 0`).
  Renaming that message silently disables A-11. A structured per-event metric would be
  more robust; no backend change is proposed here.
- SLO-6 is included because OPS-001 requires alerts to reach an owner. It is currently
  the weakest link: the topic has one email subscription and no recorded confirmation.

## 3. Proposed error-budget policy

All values are **proposed — owner ratification required**.

| Policy question             | Proposed answer                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| What consumes budget?       | 5XX responses, unavailability and failed/overdue outbox deliveries. Planned maintenance counts unless it is announced and within the agreed window. |
| What happens at 50 % burn?  | Ticket to the owning team; no release freeze.                                                                                                       |
| What happens at 75 % burn?  | Release manager reviews risky changes; only fixes and low-risk changes ship until the budget recovers.                                              |
| What happens at 100 % burn? | Feature rollout freeze for the affected surface; reliability work takes priority; owner records the exception and recovery date.                    |
| Who can grant an exception? | `<platform-owner>` with a written expiry date; never a permanent waiver.                                                                            |
| How is the budget reviewed? | Monthly, using the same metric queries named above. A review that cannot produce a query result is recorded as "not measured", not as healthy.      |

No auto-rollback, paging integration or release-gate automation is proposed as part of
this draft. Those need separate reviewed changes after the objectives are ratified.

## 4. Proposed routing model

Names are deliberately placeholders. Do not treat a placeholder as a staffed rotation.

| Placeholder            | Proposed responsibility                                                              | Current reality / decision needed                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `<on-call-primary>`    | First acknowledgement, triage, incident timeline, page escalation.                   | No on-call rotation, pager or acknowledgement path exists. Owner must name a person/rotation before SLO-1/3/4/5 are live. |
| `<on-call-secondary>`  | Backup acknowledgement when primary does not respond within 5 minutes.               | Not configured. Needs a second SNS subscriber or pager escalation policy.                                                 |
| `<platform-owner>`     | AWS/Terraform changes, alarm routing, state lock, SNS delivery, production commands. | Role exists in the runbook; no named person or backup is recorded in this repository.                                     |
| `<backend-owner>`      | Lambda/API behaviour, migrations, outbox and pool investigation.                     | Role exists in the runbook; no named person or backup is recorded.                                                        |
| `<data-privacy-owner>` | Restore target time, acceptable data loss, CV/profile retention and notification.    | Role exists in the runbook; no named person is recorded.                                                                  |
| `<security-owner>`     | Secret rotation, credential exposure, IAM/OIDC and crash-data privacy review.        | Role exists in the runbook; no named person is recorded.                                                                  |
| `<release-manager>`    | Deploy freeze, rollback decision and error-budget exceptions.                        | No release-manager role is defined today. Either assign one or fold the duty into `<platform-owner>` explicitly.          |

At minimum, the owner must replace every placeholder with a name or a staffed rotation
and record a backup. An email inbox that only one person reads is not a rotation.

## 5. Missing crash-reporting provider decision

**Status: no provider selected. Nothing is integrated. This is an owner decision, not a
completed task.**

What is known from this repository:

- No crash-reporting SDK, DSN, API key, source-map upload step or privacy-scrubbing
  configuration is checked in here.
- The archived infrastructure README records Sentry as skipped because there was no
  account. The task ledger still carries OPS-001's crash-reporting checkbox as open.
- The web, mobile and backend repositories own their client code; adding an SDK is not a
  Terraform-only change. This document does not claim any of those repositories are
  already instrumented.

| Option (proposed)        | Fit                                                                                                     | Main risks / trade-offs                                                                                     | Proposed default                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Sentry (EU region)       | Web, mobile and optionally backend; source maps, release tagging, stack grouping, alerting.             | Cost, DPA/data-residency review, session replay/PII defaults, source-map access control.                    | **Shortlist as the single cross-platform option if the owner proceeds.**                  |
| Firebase Crashlytics     | Native Android/iOS crash capture, familiar to mobile teams.                                             | Mobile-only; Google data-processing terms; no web SPA or backend coverage; source maps handled differently. | Acceptable only if mobile already standardises on Firebase; then web needs a second tool. |
| Bugsnag or equivalent    | Web/mobile/backend coverage similar to Sentry.                                                          | Another vendor/DPA and cost; no reason to prefer without a concrete requirement.                            | Not preferred over Sentry EU unless pricing/support differs materially.                   |
| No provider (status quo) | CloudWatch remains the only operational telemetry; client crashes stay invisible unless a user reports. | Blind to client-side crashes, release-specific regressions and device/OS patterns; OPS-001 remains open.    | **Interim default until the provider, DPA and scrubbing rules are ratified.**             |

If a provider is approved, the minimum acceptance evidence is:

1. DSN/API key stored in Secrets Manager or the platform's secret store, never in a
   repository or build log.
2. Source maps uploaded from the exact release commit, access restricted, and release
   tags matching the deployed SHA/version.
3. A written scrubbing list covering email addresses, names, CV/document content,
   tokens, query strings and IP addresses; session replay disabled or fully masked.
4. EU data residency/DPA and retention period approved by `<data-privacy-owner>`.
5. A deliberate staging crash that appears once, maps to the correct source line, shows
   the correct release and contains none of the scrubbed fields.
6. A rollback/disable path that does not require a code deploy during an incident.

Until all six exist, the honest status is "no client crash visibility".

## 6. Live drills still required

No drill below was run for this document. Each needs an owner, a scheduled window, a
recorded start/end time, the affected commit/artefact and the observed data-loss window.
Commands are in [INCIDENT_RECOVERY_RUNBOOK.md](INCIDENT_RECOVERY_RUNBOOK.md); do not
invent results.

| Drill                   | What must be exercised                                                                                                                         | Proposed pass criterion (proposed — owner ratification required)                                                                                    | Accountable owner                           | Evidence to record                                                                                                         | Status  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------- |
| Database restore (PITR) | Restore `dev` to a **new** instance at a chosen timestamp, validate schema/migrations and representative reads, then decide repoint/copy.      | New instance available and verified within **60 minutes**; measured data-loss window **≤ 5 minutes** for the chosen restore point.                  | `<data-privacy-owner>` + `<platform-owner>` | Restore timestamp, target identifier, availability time, verification queries, measured RPO/RTO, decision on repointing.   | Not run |
| Deploy rollback         | Download the last known-good `backend-release-<sha>` artefact, roll back **both** `DataHandler` and `studup-outbox-worker`, verify smoke.      | Both functions updated and smoke checks pass within **15 minutes**; the previous artefact hash is recorded and reproducible.                        | `<backend-owner>` + `<release-manager>`     | `release.json` commit, ZIP SHA-256s, Lambda `CodeSha256`, rollback start/end, smoke output.                                | Not run |
| Secret rotation         | Rotate at least the master DB password (30-day path), the app-role password, JWT and one provider key (Brevo or VAPID) in a controlled window. | Each rotation leaves `/health` and an authenticated read working; failed-request overlap recorded; VAPID re-subscription impact documented if used. | `<security-owner>` + `<data-privacy-owner>` | `describe-secret` before/after, rotation logs, affected sessions, error counts during overlap, post-rotation verification. | Not run |
| SNS alarm delivery      | Publish a test message to `studup-alarms`, confirm the subscription, and record when a human receives/acknowledges it.                         | Confirmed subscription; acknowledgement within **5 minutes**; repeat publication reaches the backup route as well.                                  | `<platform-owner>` + `<on-call-primary>`    | Subscription list with confirmation status, publish time, receipt/ack time, notification ID, screenshot or message header. | Not run |

Additional drill (proposed, not one of the four required above): induce one real alarm
(for example a controlled failing request) and confirm the full path alarm → SNS →
human, rather than publishing directly to SNS. The direct-publish drill proves the topic
and subscription; it does not prove that CloudWatch alarm actions are wired correctly.

## 7. Ratification checklist

- [ ] Replace every `<placeholder>` with a named owner or staffed rotation and a backup.
- [ ] Ratify or change SLO-1 to SLO-6 targets, windows and burn rules.
- [ ] Ratify the error-budget policy and the release-freeze thresholds.
- [ ] Confirm the SNS email subscription; add the backup route and decide on KMS.
- [ ] Decide the crash-reporting provider (or record a deliberate "no provider" decision
  with its risk), plus DPA, scrubbing and retention.
- [ ] Schedule and run the four drills; attach evidence and measured RTO/RPO.
- [ ] Only after the above, add burn-rate/latency/freshness alarms in a reviewed
  Terraform change and remove overlapping static alarms.
- [ ] Record the exact date and approver in the task ledger; until then OPS-001 remains
  a documentation draft, not live proof.

## 8. What this document does not claim

- It does not claim any objective is met, any alert reaches anyone, or any drill passed.
- It does not add, remove or modify an alarm, SNS subscription, log group or Terraform
  resource.
- It does not choose a crash-reporting vendor on the owner's behalf.
- It does not change CI. `npm run check` still runs before the Trivy configuration scan,
  the scan still fails on HIGH/CRITICAL, and no suppression or deletion step is added.
