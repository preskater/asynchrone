# Clients Feature Roadmap — Agency / Service Provider Workspace

This document lists the features to implement in the Clients module, ordered by priority.
The product is designed for an agency or IT service provider, with a strong
focus on client relationships, project delivery, and a read-only client portal.

A key product principle: **clients must be able to follow the progress of their
projects in a read-only client portal**, while internal teams retain full
editing and administration capabilities.

Marketing and communication tooling is **out of scope for this roadmap**: the
agency's existing communication products (social publishing, content calendar,
campaigns, email marketing sequences, communication reporting) will be
connected later through a modular integration layer instead of being built into
the Clients core.

---

## Priority levels

- **P0 — MVP / Core**: Required for a usable first release.
- **P1 — High**: Required shortly after the MVP to make the Clients module operational for a real agency.
- **P2 — Medium**: Important for scale, automation, and better reporting.
- **P3 — Later / Differentiators**: Advanced features.

---

## Already shipped (as of 2026-10-14)

The Clients core is live; the data model is documented in
[ADR-0012](docs/adr/0012-extend-clients-into-crm-core.md) and the code lives in
`apps/copilot/lib/crm/`, `apps/copilot/actions/crm.ts` and `apps/copilot/components/crm/`.

- **Users & access**: email/password authentication, organizations, roles
  (owner/admin/member/viewer), record owners, audit trail.
- **Companies & contacts**: search and filters, duplicate detection, CSV
  import/export, archive/restore, custom fields (text, number, date, select,
  multi-select, boolean, URL, email, phone).
- **Sales pipeline**: configurable pipelines and stages, kanban board with drag
  & drop, deal won/lost with loss reason, weighted forecast, per-page stats.
- **Activities**: notes, calls, emails and meetings merged with system events
  on per-record timelines.
- **Tasks** (project-scoped): assignees, priorities, labels, comments,
  subtasks, task templates.
- **Projects**: members, labels, start/due dates, budgeted hours, activity feed;
  linkable to a company from its Clients record (the project page links back to
  the company).
- **Files**: resumable upload protocol, versions, sharing, PostgreSQL
  large-object storage.
- **Documents on records**: link existing files to companies, contacts and
  deals from record pages (picker, unlink, internal/client visibility),
  history on the record timeline.
- **Notifications (in-app)**: header bell with unread count, read/unread
  state, triggers on task assignment, deal stage changes and deal won/lost,
  click-through to the related record.
- **Client portal**: portal accounts invited from a company record (admin
  creates an invitation and shares the link), a `client` organization role
  scoped to one company, read-only dashboard and project pages (progress,
  tasks, shared documents), shared discussion thread with the team, task
  detail (read-only) with comments, client document uploads and unread “new
  since last visit” badges; per-project **client access policies** (portal
  visibility, discussion and task comments: hidden / read / read & write)
  in the project settings; downloads go through a dedicated portal endpoint
  and internal workspace access is blocked for portal users.
- **Employees**: time tracking (half-day entries allocated to projects), leave,
  capacity, payroll.
- **Assistant**: client data available to the AI assistant through MCP tools
  (OAuth2-protected endpoint).

---

## P0 — Remaining

### 1. Client portal — read-only project view (shipped)

Shipped: email/password portal accounts as restricted organization members
(the `client` role linked to one company), invited from the company record
(the admin shares the invitation link manually); dashboard with the
company's projects (progress, due dates) and its client-visible documents;
project page with status, progress, tasks/milestones and the **shared
discussion thread**; **task detail pages** (read-only: status, priority,
description, labels, checklist) with a **shared task comment thread**;
clients can **post messages** and **task comments** (the team is notified
in the header bell) and **upload documents** (max 25 MB, stored as workspace
files and linked to the company as client-visible documents); per-project
**client access policies** in the project settings — portal visibility,
discussion and task comments each set to **hidden / read-only / read &
write** (the internal task panel shows client comments with a “Client”
badge and internal authors can reply there); the team gets a **Discussion
tab** on the project page and unread “new since last visit” badges greet
the client; downloads are served by a dedicated portal endpoint that
enforces the client-visible link; portal users are redirected to `/portal`
and blocked from the internal workspace (pages, server actions, file API
and MCP).

Remaining:

- Per-activity visibility so internal project updates can be marked
  client-visible.
- Validation requests / approvals on specific deliverables.
- Email notifications and digests for clients (they currently rely on the
  “new since last visit” badges).
- Magic-link sign-in and multiple companies per portal user.

**Goal:** Improve transparency, reduce status-request emails, and build client
trust.

### 2. Documents connected to Clients records (partially shipped)

Shipped: linking existing files to companies, contacts and deals from record
pages (picker, unlink), internal vs client-visible flag per linked document,
audit + timeline events, MCP tools (`list_client_documents`, `link_client_document`,
`unlink_client_document`).

Remaining:

- Upload directly from a Clients record (reuse the chunked upload protocol
  instead of switching to the Files module).
- Deliverable validation requests from the portal (with item 1).

**Goal:** Centralize contracts, specifications, invoices, designs, reports and
deliverables on the record they belong to.

### 3. Notifications (in-app shipped)

Shipped: in-app notifications with read/unread state and a header bell;
triggers on task assignment, deal stage changes and deal won/lost;
click-through navigation; mark one / mark all as read.

Remaining:

- Email transport and per-user notification preferences.
- Task due-date reminders (needs a scheduler).
- Mentions in comments and activity descriptions.
- Client portal activity notifications (with item 1).

**Goal:** Keep internal teams and clients informed without requiring them to
check the Clients module constantly.

---

## P1 — High priority

### 4. Dashboards and reporting

Existing: per-page stat cards in the Clients module; Employees has its own reports.

Missing: personal dashboard (my deals, my tasks, recent activities); agency
dashboard (active projects, pipeline value, overdue tasks, upcoming deadlines);
sales reports (pipeline by stage, won/lost, average deal size, sales-cycle
duration, conversion by stage, revenue forecast); project reports (projects by
status, at risk, late milestones, workload); client reports (active clients,
revenue by client, projects by client, activity history).

### 5. Permissions and data access control

Existing: module-level role checks (viewer read-only, member edits, admin
configures) and audit entries for Clients actions.

Missing: custom roles; module-level permission matrix (view/create/edit/delete/
export); field-level permissions; record-level visibility rules (own records /
team / all); export restrictions per role; an audit-log viewer (Employees has an
admin-only audit export).

### 6. Custom fields completion

Existing: custom fields on companies, contacts and deals.

Missing: projects and tasks entities; field visibility and edit permissions;
field grouping on record pages.

### 7. Email integration

Connect a professional inbox (Google/Microsoft), send emails from the Clients module, log
inbound and outbound emails onto the relevant records, email templates with
variables, and delivery/open tracking.

### 8. Calendar and meeting scheduling

Existing: the calendars module (personal/team calendars, events, attendees).

Missing: events linked to contacts/companies/deals; Google Calendar /
Outlook sync; availability sharing or scheduling links; meeting notes captured
as client follow-up tasks.

### 9. Quotes, contracts and approvals

Quote/proposal creation from deal data with line items, quantities, discounts,
taxes and totals; quote templates; PDF generation; quote statuses (draft, sent,
viewed, accepted, rejected, expired); contract storage; electronic approval or
signature; automatic conversion of an accepted quote into a project and/or
invoice.

### 10. Invoicing and payments

Invoice creation from accepted quotes or projects; recurring invoices for
retainers; invoice statuses (draft, sent, paid, partially paid, overdue,
cancelled); payment tracking and reminders; basic revenue reporting;
accounting/payment provider integrations.

### 11. Time tracking completion

Existing: Employees half-day attendance allocated to projects, billable/non-billable
flags, planned vs actual hours, payroll costs.

Missing: a manual timer; time entries linked to tasks; hourly rates per
project or service; conversion of billable time into invoices (with item 10).

---

## P2 — Medium priority

### 12. Automation engine

Triggers (record created, stage changed, task completed, date reached, form
submitted), actions (create task, notify, assign owner, update field, move
stage), templates, execution logs, error handling, loop safeguards.

### 13. Forms and lead capture

Public forms for contact requests, project briefs and partnership
applications; form builder with custom fields; spam protection; automatic
creation of company/contact/deal from submissions; routing rules; confirmation
emails.

### 14. Client requests and tickets

Intake through the portal, email or forms; categories (support, bug, change
request, new project, question); priority, status, assignee, SLA and due date;
conversion to project or task; client-visible status; internal resolution
notes.

### 15. Templates and standardization

Existing: task templates.

Missing: project, milestone, email, proposal and onboarding templates; standard
service packages.

### 16. Search, saved views and bulk actions

Global search across companies, contacts, deals, projects and files (the
search page is a placeholder today); advanced combined filters; saved views per
user and team; shared views; bulk edit and bulk export; saved reports.

### 17. Integrations

Google Workspace and Microsoft 365; Stripe and other payment providers;
accounting tools; e-signature providers; Zapier/Make connectors.

### 18. Public API and webhooks

Existing: the MCP endpoint with OAuth2 (ADR-0006, ADR-0011).

Missing: REST or GraphQL API; API keys; rate limiting; webhooks for major
events; API documentation; sandbox environment.

---

## P3 — Later / Differentiators

### 19. AI-assisted features

Existing: the AI assistant with MCP access to client data.

Missing: AI-generated meeting summaries; AI project status updates for
clients; suggested next actions; email draft assistance; deal-risk detection;
automatic categorization of client requests; semantic search across notes,
documents and communications.

### 20. Resource planning and capacity

Existing: Employees capacity and leave views, capacity alerts.

Missing: allocation tied to deals/projects with forecasting; conflict
detection beyond alerts; skill-based assignment.

### 21. Financial profitability

Existing: payroll costs in Employees.

Missing: cost tracking per project; gross margin per project, client and
service; revenue recognition; forecast vs actual revenue (depends on item 10).

### 22. Mobile experience

Existing: responsive web application.

Missing: installable PWA; native applications only if usage justifies it.

---

## Deferred — Communication and marketing tool integration

The agency's communication products will be connected **after** the Clients core
is stable, through a modular integration layer rather than inside the Clients:

- LinkedIn post planning and publishing, social media performance tracking,
  content calendar, campaign management, email marketing sequences.
- Communication reporting per client, lead attribution from campaigns,
  automatic creation of records from campaign interactions.

---

## Suggested order

1. **Global search** (item 16) — the route already exists as a placeholder.
2. **Dashboards** (item 4) — build on the existing stat computations.
3. **Quotes → invoicing → time tracking/profitability** (items 9 → 10 → 11).
