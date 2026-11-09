# 0039. File support tickets in the identity database and work them from the control tower

- Status: accepted
- Date: 2026-11-06
- Deciders: platform
- Issue: #101

## Context

Before the first paying customer, support had no record: the in-app feedback
form sent one email to `FEEDBACK_EMAIL_TO` and stored nothing, a failed delivery
lost the report, and nobody could say whether a request was answered. There was
no published policy, no status link and no help entry point outside Copilot.

The issue explicitly rules out a CRM/helpdesk build, 24/7 coverage and paid
support.

## Considered options

1. **Keep email only** and adopt a shared-inbox tool. No ticket ids or status in
   our system; diagnostics stay in a mail body.
2. **Integrate a helpdesk provider** (Plain, Help Scout, Zendesk). Full
   features, but a new sub-processor (legal pack), a new secret, and customer
   data leaving our databases.
3. **A `supportTicket` table in the identity database**, worked from the control
   tower through the existing `/internal/v1/admin/*` API, with the email kept
   as a notification.

## Decision

Option 3.

- `SupportTicket` lives in `asynchrone_identity` (Copilot owns the form and the
  organization/user rows it cascades from). It carries a sequential `number`,
  `status` (`open → acknowledged → resolved`), `assigneeEmail`, `acknowledgedAt`
  / `resolvedAt` and a `context` JSON with page, build SHA, correlation id and
  recent client errors.
- The control tower reads and updates tickets only through `IdentityAdminClient`
  (`/internal/v1/admin/support-tickets`), like every other customer read model
  (ADR 0034), and writes a `PlatformAuditEvent` per transition.
- Every app's shell (`@workspace/app-shell/support`) adds a header help menu
  and a footer that link to Copilot's help center, ticket form and
  `/api/status` redirect, so domain apps need no new configuration.
- The policy table (channels, severities, first-response targets) is code in
  `@workspace/core/support`, rendered by the landing `/support` page and the
  control tower, so the published promise and the queue cannot drift.

## Consequences

- Tickets survive email outages and are traceable end to end; the email remains
  the reply channel (the reporter is the `Reply-To`).
- No conversation threading in-app: replies happen in the shared inbox. If
  volume or Enterprise needs outgrow that, revisit option 2 and migrate the
  table's rows.
- Deleting a user or organization cascades their tickets, consistent with the
  erasure sagas.
- The landing now depends on `@workspace/core` for the dependency-free plan and
  support tables; the stateless import-graph test allows it explicitly.
