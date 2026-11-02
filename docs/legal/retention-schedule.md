# Data retention schedule

The public retention table lives in `packages/i18n/messages/{en,fr}/legal.json` under
`privacy.s3t1` and renders on `/legal/privacy` and in
`public/downloads/legal/privacy-{en,fr}.pdf`. This page maps each public claim to
the code that implements it, so whoever answers a security questionnaire can
point at a mechanism rather than a promise.

`npm run verify:legal-copy --workspace=landing` checks that both locales have the
same keys and that tables are well formed. It cannot check facts: when either
the copy or the code changes, a reviewer has to confirm the two still agree.

| Data                                                                                    | What we publish                                                                                                                                              | Implemented by                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace content — projects, tasks, messages, calendars, Clients and Employees records | Deleted 30 days after an owner requests it; the workspace keeps working until then                                                                           | `DELETION_GRACE_DAYS` in `apps/copilot/lib/organization/deletion-service.ts`; rows deleted in a transaction by `/api/cron/organization-deletion`, scheduled daily at 03:30 in `charts/asynchrone-space/values.yaml` (`copilot.cronjobs.jobs.organization-deletion`)                                                                                      |
| Uploaded file bytes                                                                     | Deleted with the workspace                                                                                                                                   | Large objects are unlinked **after** the row transaction commits, in `processOrganizationDeletions`; `verify:organization-deletion` reports orphans                                                                                                                                                      |
| Unfinished uploads                                                                      | Swept after 1 hour                                                                                                                                           | `UPLOAD_SESSION_TTL_MS` in `packages/files/src/upload-config.ts`; `/api/files/uploads/sweep` runs daily at 03:00 and opportunistically when a new upload starts                                                                                                                                          |
| Sign-in sessions                                                                        | 7 days in the customer app, 4 hours in the control tower                                                                                                     | Better Auth default (no `session.expiresIn` in `apps/copilot/lib/auth.ts`); explicit `expiresIn: 60 * 60 * 4` in `apps/control-tower/lib/auth.ts`                                                                                                                                                            |
| Sign-in and API rate-limit counters                                                     | Overwritten per window, pruned within the hour                                                                                                               | `rateLimit` rows in `packages/db/prisma/schema.prisma`; Better Auth prunes rows older than its longest window (`packages/core/src/rate-limit.ts`)                                                                                                                                                        |
| Trial claim record                                                                      | Retained after deletion, disclosed                                                                                                                           | `TrialClaim` model — no relation to `Organization`, so the delete cascades do not reach it                                                                                                                                                                                                               |
| Platform audit events                                                                   | Retained after deletion, disclosed                                                                                                                           | `PlatformAuditEvent` model — `organizationId` is a plain column, not a foreign key                                                                                                                                                                                                                       |
| Workspace audit log                                                                     | Pruned after the plan's window while the workspace exists (30 days on Starter, 12 months on Team, configurable on Enterprise) and deleted with the workspace | `AUDIT_RETENTION_DAYS` / `resolveAuditRetention` in `apps/copilot/lib/audit/retention.ts`; `pruneAuditLogs` run by `/api/cron/audit-retention`, scheduled daily at 03:45 in `charts/asynchrone-space/values.yaml` (`copilot.cronjobs.jobs.audit-retention`). Readable and exportable only where the `auditLog` entitlement is granted (Enterprise) |

## Records that outlive a workspace

Only two, and both are named in the privacy policy:

- `PlatformAuditEvent` — the record of what platform staff did, including the
  deletion itself. Deleting it would remove the evidence that the deletion was
  authorised.
- `TrialClaim` — the email address and company domain used to claim a Team
  trial, kept so the same trial cannot be claimed again.

If a third record ever has to survive, add it to the privacy policy's retention
section in both locales before shipping the change.

## Claims an operator must be able to defend

These sentences are on the security page and in the DPA. They are true of the
software, but each deployment has to make them true of the infrastructure:

- **“Data at rest sits on encrypted storage volumes.”** OVHcloud does not
  encrypt block storage by default; enable encrypted volumes (or the equivalent
  LUKS layer) in Gravelines before a customer asks.
- **“Backups and point-in-time recovery are configured by the operator.”**
  Confirm the current backup schedule, retention and restore runbook, and keep
  them available for `security@asynchrone.space` to send on request.
- **“Hosting and PostgreSQL run on OVHcloud in Gravelines, France.”** A
  deployment in another region must not publish this page unchanged.
- **“We monitor for anomalies.”** Have alerting on authentication failures,
  platform audit events and error rates before answering a questionnaire.

## Known gaps

- There is no self-service export of a whole workspace. The privacy policy says
  a complete export is provided on request within 30 days; that is a manual
  process today.
- Deleting a workspace does not delete the platform audit events or trial claim
  records it produced — this is intentional and disclosed, not a bug.
- Nothing purges `PlatformAuditEvent` or `TrialClaim` on a timer. If a legal
  retention limit is ever set for them, the deletion cron is the place to add
  it.
