# Support runbook

How the Asynchrone Space team receives, triages, answers and closes customer
support requests (#101). The customer-facing promise is the published policy at
`https://asynchrone.space/<locale>/support`; this runbook is how we keep it.

## Where requests come from

| Channel | Lands in | Notes |
| --- | --- | --- |
| In-app **Help → Contact support** (every app's header and footer) | `supportTicket` row in the identity database + email to `FEEDBACK_EMAIL_TO` | Preferred. Carries organization, user, role, page, locale, viewport, user agent, build SHA (`GIT_COMMIT_SHA`), correlation id (`rid`) and up to five recent client errors. |
| Email to `support@asynchrone.space` | Shared inbox | Create the ticket yourself by asking the customer to use the in-app form, or answer directly and note it in the inbox. |
| Security reports | `SECURITY.md` process | Never through the support queue. |

The email is only a notification. **The ticket row is the record**: a failed
email delivery does not lose a ticket, and the control tower is the queue.

## The policy we publish

Single source of truth: `packages/core/src/support.ts`. The landing `/support`
page, the Copilot help center and the control-tower targets all render from it.
Change the numbers there, never in copy.

- **Hours:** Monday–Friday, 09:00–18:00 Europe/Paris, French public holidays
  excluded. No 24/7 coverage.
- **Channels:** Starter = in-app ticket, email, community (best effort);
  Team = in-app ticket and email with response targets; Enterprise = the same
  plus a named support contact.
- **First-response targets** (business hours; a business day is 9 hours):

  | Plan | Sev 1 | Sev 2 | Sev 3 |
  | --- | --- | --- | --- |
  | Starter | best effort | best effort | best effort |
  | Team | 4 h | 1 day | 2 days |
  | Enterprise | 2 h | 4 h | 1 day |

- **Severities:** Sev 1 = service down, data lost or at risk, or a security
  incident, no workaround. Sev 2 = a major feature broken for many users, the
  workaround is painful. Sev 3 = partial problem with a workaround, a question
  or a how-to. The form's impact maps `critical → Sev 1`, `high → Sev 2`,
  `medium`/`low → Sev 3`; triage may change it.

Targets are for a **first human response**, not a fix.

## Triage (control tower → Support)

1. Open `/support` in the control tower. It defaults to **open** tickets,
   newest first; the *Target* column is the policy target for that plan and
   severity.
2. Open the ticket, read the report and the **Diagnostics** block.
3. Click **Acknowledge**: it stamps `acknowledgedAt` (what the target is
   measured against), assigns the ticket to you if nobody owns it, and writes a
   `support_ticket.acknowledge` platform audit event.
4. Reply to the customer from the shared inbox (reply to the notification
   email; its `Reply-To` is the reporter's contact address). Quote the ticket
   number (`#42`) in the subject.
5. Investigate:
   - Search the logs for the **request id** (`rid`) — every app logs it, so it
     stitches the user's flow across Copilot and the domain hosts
     (`docs/observability.md`).
   - Match the **build SHA** against the deployed image tag (`sha-…`) to know
     which release the user ran.
   - The **recent errors** are client-side messages caught by the shell; look
     them up in Sentry when `SENTRY_DSN` is set.
6. **Resolve** once the customer has an answer or a fix is deployed. **Reopen**
   if they come back on the same issue. Every transition is in the platform
   audit trail and on the ticket's *Lifecycle* block.

Assignment is by operator email. Use **Assign to me** before working a ticket
someone else might pick up, **Unassign** when handing it back.

## Escalation

| Situation | Escalate to | How |
| --- | --- | --- |
| Sev 1 (outage, data loss, security) | On-call engineer **and** the incident lead | Page immediately; open an incident on the status page within 30 minutes; post updates there at least every hour until resolved. |
| Sev 2 not understood within the target | Engineering owner of the affected app | Link the ticket in the engineering channel with the request id and build SHA. |
| Billing dispute, refund or compensation request | Founders / billing owner | See *Refunds and compensation* below. Do not promise anything in the first reply. |
| Suspected security issue | Security contact in `SECURITY.md` | Move it out of the support queue; resolve the ticket with a pointer. |
| Legal or data-protection request (GDPR access/erasure) | Data-protection contact | Use the export/deletion flows (`docs/domain-app-sagas.md`); never hand-delete rows. |

After a Sev 1, write a short post-incident note (timeline, cause, fix,
follow-ups) and link it from the status-page incident.

## Status page and incident communication

- The hosted status page URL is `STATUS_PAGE_URL` on Copilot. Every app's help
  menu and footer link to `${COPILOT}/api/status`, which redirects there (and
  to the landing `/support` page while it is unset). Customers subscribe and
  read the incident history on the status page itself.
- Wire the status page's monitors to each app's `GET /api/health`
  (`docs/observability.md`).
- During an incident: status page first, then reply to the related tickets with
  a link to the incident instead of answering each one separately.

## Refunds and compensation

There is no automatic SLA credit. Refunds, credits or plan extensions are a
business decision made by the billing owner, then applied through Stripe or a
control-tower plan override (`docs/billing.md`). The contractual terms are the
Terms of Service and, for Enterprise, the order form
(`apps/landing/lib/landing/legal.ts`, `docs/legal/README.md`).

## Using the control tower safely

Every action below writes a `PlatformAuditEvent` with your identity, role and
before/after values. Act only on the account the ticket is about, and note the
ticket number in your reply.

- **Impersonation** (`platform_admin`): open the user from the ticket, then
  *Impersonate*. It creates a single-use handoff and a one-hour Copilot
  session marked `impersonatedBy`; the customer sees nothing, you see the
  banner. Ask the customer first unless it is a Sev 1. Use it to reproduce,
  never to change their data. Leave with **Stop impersonating**.
- **Plan override / trial** (`platform_admin`): organization page → plan form.
  A manual plan sets `manualOverride`; release it when Stripe should drive the
  plan again (`docs/billing.md`).
- **Session revocation** (`platform_support` or admin): user page → *Revoke
  sessions* signs the user out everywhere, e.g. for a compromised account.
- **Ban** (`platform_admin`): abuse only, with a reason.

Never share a handoff link, never ask a customer for their password or TOTP
code, and never edit customer data directly in the database.

## Configuration checklist

- `FEEDBACK_EMAIL_TO` on Copilot points at the shared support inbox.
- `STATUS_PAGE_URL` on Copilot points at the hosted status page.
- `LANDING_APP_URL` on Copilot is the public site (help center links).
- Operators have a platform role and TOTP (`AGENTS.md` → Control tower).
