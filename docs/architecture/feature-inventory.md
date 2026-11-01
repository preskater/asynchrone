# Feature inventory and parity checklist

Last audited: 2026-11-01 (issues #146–#151).

This document is the surface inventory for the domain-app split. Every route,
server action, API handler, cron job, MCP tool, Prisma model, audit action,
portal surface, internal endpoint, environment variable and test is assigned to
exactly one app. It is a snapshot of the monolith before phase 4: `apps/web`
still serves every customer surface from one runtime and one database, while
the per-app database packages and the shared kernel (`@workspace/core`,
`@workspace/auth`, `@workspace/organization`, `@workspace/app-shell`,
`@workspace/i18n`, `@workspace/next-config`) already exist.

Keep this document current in the same pull request that moves a surface. A
surface may only move when its target app owns the database, internal contract
and tests listed here.

See also:

- [Domain apps: ownership and boundaries](./domain-apps.md)
- [ADR 0028](../adr/0028-split-workspace-into-domain-apps.md)
- [ADR 0032](../adr/0032-give-each-app-its-own-database.md)
- [ADR 0033](../adr/0033-keep-audit-export-and-deletion-consistent-across-databases.md)

## Apps and data

| App                  | Host                                 | Database                   | Internal audience                  | OAuth client                   |
| -------------------- | ------------------------------------ | -------------------------- | ---------------------------------- | ------------------------------ |
| `apps/landing`       | `asynchrone.space`                   | none                       | `urn:asynchrone:app:landing`       | none                           |
| `apps/copilot`       | `copilot.asynchrone.space`           | `asynchrone_identity`      | `urn:asynchrone:app:copilot`       | `COPILOT_OAUTH_CLIENT_*`       |
| `apps/projects`      | `projects.copilot.asynchrone.space`  | `asynchrone_projects`      | `urn:asynchrone:app:projects`      | `PROJECTS_OAUTH_CLIENT_*`      |
| `apps/calendars`     | `calendars.copilot.asynchrone.space` | `asynchrone_calendars`     | `urn:asynchrone:app:calendars`     | `CALENDARS_OAUTH_CLIENT_*`     |
| `apps/files`         | `files.copilot.asynchrone.space`     | `asynchrone_files`         | `urn:asynchrone:app:files`         | `FILES_OAUTH_CLIENT_*`         |
| `apps/messages`      | `messages.copilot.asynchrone.space`  | `asynchrone_messages`      | `urn:asynchrone:app:messages`      | `MESSAGES_OAUTH_CLIENT_*`      |
| `apps/clients`       | `clients.copilot.asynchrone.space`   | `asynchrone_clients`       | `urn:asynchrone:app:clients`       | `CLIENTS_OAUTH_CLIENT_*`       |
| `apps/employees`     | `employees.copilot.asynchrone.space` | `asynchrone_employees`     | `urn:asynchrone:app:employees`     | `EMPLOYEES_OAUTH_CLIENT_*`     |
| `apps/control-tower` | `control-tower.asynchrone.space`     | `asynchrone_control_tower` | `urn:asynchrone:app:control-tower` | `CONTROL_TOWER_OAUTH_CLIENT_*` |

Today only `apps/web` and `apps/control-tower` exist. `apps/web` is the future
`apps/copilot`; the portal stays inside Copilot (there is no `apps/portal`).

## Landing

Target: `apps/landing`, stateless. No session, no database, no internal API.

| Surface         | Current location                                                                                                | Notes                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Marketing pages | `apps/landing/app/[locale]/(marketing)/*`                                                                           | home, about, blog, blog/[slug], careers, contact, FAQ, features, legal/[slug], pricing |
| Content         | `apps/landing/content/blog/<locale>`                                                                            | MDX mirrored in `en` and `fr`                                                          |
| Legal copy/PDFs | `apps/landing/lib/landing/legal.ts`, `packages/i18n/messages/{en,fr}/legal.json`, `apps/landing/public/downloads/legal` | `verify:legal-copy`, `legal:pdfs`                                                      |
| Layout/metadata | `apps/landing/app/[locale]/(marketing)/layout.tsx`, `apps/landing/mdx-components.tsx`                           |                                                                                        |

No server actions, API routes, cron jobs, MCP tools, Prisma models or audit
actions. Keeping the landing database-free is an acceptance criterion of #176
and #167.

## Copilot

Target: `apps/copilot` (the renamed `apps/web`). Owns the identity database and
is the only OAuth 2.1/OIDC authorization server.

### Pages and layouts

| Surface                    | Current location                                         |
| -------------------------- | -------------------------------------------------------- |
| Sign in / sign up          | `app/[locale]/sign-in`, `sign-up`                        |
| Password reset             | `app/[locale]/forgot-password`, `reset-password`         |
| Two-factor challenge/setup | `app/[locale]/two-factor`, `two-factor/setup`            |
| Consent                    | `app/[locale]/consent`                                   |
| Onboarding                 | `app/[locale]/onboarding`                                |
| Organization selection     | `app/[locale]/select-organization`                       |
| Invitation acceptance      | `app/[locale]/accept-invitation`                         |
| Account settings           | `app/[locale]/(app)/settings/account`                    |
| Global feedback            | `app/[locale]/(app)/feedback`                            |
| Workspace shell            | `app/[locale]/(app)/layout.tsx`                          |
| Workspace home             | `app/[locale]/(app)/[orgSlug]/page.tsx`                  |
| Organization settings      | `app/[locale]/(app)/[orgSlug]/settings`                  |
| Global search              | `app/[locale]/(app)/[orgSlug]/search`                    |
| Help                       | `app/[locale]/(app)/[orgSlug]/help`                      |
| Organization feedback      | `app/[locale]/(app)/[orgSlug]/feedback`                  |
| Client portal              | `app/[locale]/portal/*` (stays here; see Portal below)   |
| Not found / catch-all      | `app/[locale]/[...rest]`, `app/[locale]/(app)/error.tsx` |

### Server actions

`apps/web/actions/account.ts`, `appearance.ts`, `audit.ts`, `billing.ts`,
`data-export.ts`, `feedback.ts`, `notifications.ts`,
`organization-deletion.ts`, `trial.ts`, `two-factor-policy.ts`.

They cover account deletion, organization appearance, audit list/facets/export/
retention, billing checkout/portal/sync, data export requests, feedback,
notifications, organization deletion scheduling/cancelling, trial start and the
organization 2FA policy.

### API routes

| Route                                                 | Method   | Owner                         |
| ----------------------------------------------------- | -------- | ----------------------------- |
| `/api/assistant`                                      | POST     | Copilot (assistant)           |
| `/api/auth/[...all]`                                  | GET/POST | Copilot (Better Auth + OIDC)  |
| `/api/health`                                         | GET      | every app (same payload)      |
| `/api/cron/audit-retention`                           | GET      | Copilot (audit)               |
| `/api/cron/data-exports`                              | GET      | Copilot (export saga)         |
| `/api/cron/organization-deletion`                     | GET      | Copilot (deletion saga)       |
| `/api/cron/trial-expiry`                              | GET      | Copilot (billing/trial)       |
| `/api/organizations/exports/[exportId]/download`      | GET      | Copilot (data export)         |
| `/api/platform/handoff`                               | GET      | Copilot (impersonation claim) |
| `/api/platform/stop-impersonating`                    | POST     | Copilot (impersonation end)   |
| `/api/webhooks/stripe`                                | POST     | Copilot (billing)             |
| `/.well-known/openid-configuration/[[...path]]`       | GET      | Copilot (OIDC discovery)      |
| `/.well-known/oauth-authorization-server/[[...path]]` | GET      | Copilot (OAuth metadata)      |
| `/.well-known/oauth-protected-resource/[[...path]]`   | GET      | Copilot (RFC 9728 metadata)   |
| `/mcp`                                                | POST     | Copilot (MCP transport)       |

### Assistant and MCP

- Assistant agent/tools: `@workspace/ai` (chat parts, pricing, agent factory and
  the quota ledger) plus `apps/web/lib/assistant/*` (tools and app wiring) and
  `apps/web/app/api/assistant/route.ts`.
- Assistant tools currently call the domain services in-process:
  `list_projects`, `get_project`, `list_tasks`, `create_project`,
  `create_task`, `update_task`, `move_task`, `list_calendar`, `create_event`,
  `list_files`, `list_conversations`, `send_message`. Calendar tools call
  `@workspace/calendars` through the app adapter.
- MCP transport: `apps/web/app/mcp/route.ts`, `apps/web/lib/mcp/*`.
- MCP tools (44) live in `apps/web/lib/mcp/tools/*` and are listed per domain
  below.
- #190 replaces the in-process calls with typed internal clients; the MCP
  transport and assistant stay in Copilot.

### Prisma models (identity database)

`User`, `Session`, `Account`, `Verification`, `Organization`, `TrialClaim`,
`Team`, `TeamMember`, `Member`, `Invitation`, `Notification`, `PortalInvite`,
`Jwks`, `OauthClient`, `OauthResource`, `OauthClientResource`,
`OauthRefreshToken`, `OauthAccessToken`, `OauthConsent`,
`OauthClientAssertion`, `TwoFactor`, `CustomerTwoFactor`, `Subscription`,
`Invoice`, `BillingEvent`, `AiUsageEvent`, `RateLimit`, `DataExport`,
`DataExportApp`, `PlatformHandoff`, `OrganizationDeletionJob`,
`OrganizationDeletionApp`, `UserDeletionJob`, `UserDeletionApp`, `AuditLog`.

### Audit, 2FA and portal

- Audit actions: `organization.*`, `member.*`, `organization.audit_retention.updated`,
  `organization.two_factor_policy.update`, `organization.export.request`,
  `organization.trial.*`, `organization.deletion.*`, `member.two_factor_*`.
- Audit entity types: `organization`, `member`, `user`, `invitation`,
  `dataExport`.
- 2FA: customer `twoFactor` plugin mapped to `CustomerTwoFactor` and
  `user.customerTwoFactorEnabled`; `/two-factor` and `/two-factor/setup`;
  organization policy in `lib/organization/two-factor-policy.ts`; audit in
  `lib/account/two-factor-audit.ts`.
- Portal: invitations (`PortalInvite`, `Member.clientId`), pages, actions and
  API routes; see the Portal section.

### Internal endpoints already hosted by Copilot

`/internal/v1/organizations/:id`, `/members`, `/entitlements`,
`/users/:id`, `/internal/v1/admin/*`, `/internal/v1/audit`,
`/internal/v1/audit/facets`, `/internal/v1/audit/export`,
`/internal/v1/audit/prune`, `POST /internal/v1/notifications`. See the internal
API map below.

## Cross-domain services (#152)

These packages are shared services over a port, not a second database client.
The owning app binds the pool, repository, provider or notifier in a thin
adapter; every other app goes through the internal contract.

| Package                   | Ships                                                                       | Bound by                                             |
| ------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| `@workspace/storage`      | PostgreSQL large-object engine for file bytes                               | Files app (`apps/web/lib/large-object.ts` today)     |
| `@workspace/notifications` | Inbox types, schemas and the notification service over a repository port    | Copilot's identity repository; domain apps use `NotificationClient` |
| `@workspace/integrations` | Provider protocol, GitHub/GitLab clients and the token cipher               | The app that owns the connection; tokens stay in its database |
| `@workspace/ai`           | Chat parts, model pricing, agent factory and the quota ledger over a store  | Copilot's `AiUsageEvent`; tools call domain APIs (#190) |
| `@workspace/appearance`   | Organization appearance types, schemas and service over a metadata store    | Copilot's `Organization.metadata`                     |
| `@workspace/billing`      | Plans, types, webhook payloads and the subscription state machine           | Copilot's Prisma repository + Stripe provider         |
| `@workspace/audit`        | Audit writer/reader, retention, HTTP handlers and cross-app fan-out         | Each app's own `AuditLog`; Copilot aggregates         |

## Projects

Target: `apps/projects` / `@workspace/projects`.

Extracted in #153. The domain package owns the repository, service, schemas,
types, project/task UI and the GitHub/GitLab repository sync. Server actions,
pages and app wiring stay in Copilot until #160 moves them with the app.

| Surface            | Inventory                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server actions     | `actions/projects.ts`, `actions/project-messages.ts`, `actions/integrations.ts` (projects, tasks, members, labels, templates, comments, project discussion thread, repository connections)                                                                          |
| API                | `POST /api/webhooks/repositories/[connectionId]`, `GET /api/cron/repository-sync`, `/api/health`                                                                                                                                                                    |
| MCP tools          | `list_projects`, `get_project`, `list_tasks`, `create_project`, `create_task`, `update_task`, `move_task`                                                                                                                                                           |
| Prisma models      | `Project`, `ProjectMember`, `Label`, `ProjectLabel`, `Task`, `TaskIdentifierCounter`, `TaskTemplate`, `TaskLabel`, `Subtask`, `TaskComment`, `ProjectActivity`, `ProjectMessage`, `RepositoryConnection`, `UserRepositoryToken`, `AuditLog`                         |
| Audit actions      | `project.created`, `project.updated`, `project.deleted`, `project.client_settings.updated`, `project.member.*`, `project.label.*`, `project.template.*`, `task.created`, `task.updated`, `task.moved`, `task.deleted`, `task.subtask.toggled`, `task.comment.added` |
| Audit entities     | `project`, `task`, `label`, `taskTemplate`                                                                                                                                                                                                                          |
| Internal endpoints | `GET /internal/v1/search`, `GET /organizations/:id/export`, `DELETE /organizations/:id`, `DELETE /users/:id` (shared handlers in `@workspace/search` / `@workspace/sagas`; not wired yet)                                                                           |

### Package layout (#153)

| Module                                     | Exports                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/projects/src/types.ts`           | Project, task, template, label, comment, activity and member types plus enum values                                                                           |
| `packages/projects/src/schemas.ts`         | Zod inputs for projects, tasks, templates, labels, members, comments and portal policies                                                                       |
| `packages/projects/src/repository.ts`      | `ProjectRepository` over the structural `ProjectDb` port                                                                                                       |
| `packages/projects/src/service.ts`         | `ProjectService`; audit, notification and repository-sync ports are injected                                                                                   |
| `packages/projects/src/task-comments.ts`   | `listTaskComments` / `createTaskComment` over the injected db + notifier                                                                                       |
| `packages/projects/src/thread.ts`          | `listProjectMessages` / `createProjectMessage` over the injected db + notifier                                                                                 |
| `packages/projects/src/task-key.ts`        | Shared identifier prefix/allocation used by the service and repository sync                                                                                    |
| `packages/projects/src/integrations/*`     | `RepositoryConnectionRepository`, `RepositoryIntegrationService`, `RepositoryWebhookHandler`, sync helpers, schemas and types                                  |
| `packages/projects/src/ui/store.tsx`       | `ProjectStoreProvider` / `useProjectStore`; takes the app's server actions as a port and exposes `canManageMembers`                                            |
| `packages/projects/src/ui/actions.tsx`     | `ProjectActions` contract + `useProjectActions()`                                                                                                              |
| `packages/projects/src/components/*`       | Project and task UI (board, list, calendar, details, dialogs, settings, templates, labels, repository and discussion)                                           |
| `apps/web/lib/projects/index.ts`           | Adapter: binds the Prisma client, `recordUserAudit`, `notificationService` and `repositoryIntegrationService`                                                   |
| `apps/web/lib/projects/{thread,task-comments}.ts` | Adapters for the portal: bind the db client + notifier                                                                                                  |
| `apps/web/lib/integrations/index.ts`       | Adapter: binds the client and `BETTER_AUTH_URL` (webhook URLs) for the repository sync                                                                          |

App-only imports are forbidden in the package (`npm run check:boundaries`).
`member`, `user` and `account` remain in the `ProjectDb` port because the
project member list and personal repository tokens still read identity tables;
they move behind the identity internal API in #190.

### Routes

| Route                                                          | Kind         | Inventory                                                                                              |
| -------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| `/[locale]/(app)/[orgSlug]/projects`                           | Page         | `projects/page.tsx`; grid + create dialog from `@workspace/projects/components/project`                |
| `/[locale]/(app)/[orgSlug]/projects/loading`                   | Loading      | `projects/loading.tsx`                                                                                  |
| `/[locale]/(app)/[orgSlug]/projects/[projectId]`               | Page         | `projects/[projectId]/page.tsx`; guards with `projectService.get`, renders `ProjectWorkspace`           |
| `/[locale]/(app)/[orgSlug]/projects/[projectId]/loading`       | Loading      | `projects/[projectId]/loading.tsx`                                                                      |
| `/[locale]/(app)/[orgSlug]/projects/[projectId]/not-found`     | Not found    | `projects/[projectId]/not-found.tsx`                                                                    |
| `/[locale]/portal/projects/[projectId]`                        | Portal page  | `portal/projects/[projectId]/page.tsx`; reads `portalService` (projects thread/comments)               |
| `/[locale]/portal/projects/[projectId]/tasks/[taskId]`         | Portal page  | `portal/.../tasks/[taskId]/page.tsx`; reads `portalService` + task comments                             |
| `/[locale]/(app)/layout`                                       | Layout       | Builds `PROJECT_ACTIONS` from the app's server actions and passes them + `canManageMembers` to the store |
| `POST /api/webhooks/repositories/[connectionId]`               | API          | `repositoryWebhookHandler` from the package adapter                                                     |
| `GET /api/cron/repository-sync`                                | Cron         | `repositoryIntegrationService.syncAllConnections()` from the package adapter                            |
| `/api/health`                                                  | API          | App health check (not project domain)                                                                   |
| MCP `/mcp` (`list_projects`, `get_project`, `list_tasks`, …)   | MCP tools    | `apps/web/lib/mcp/tools/projects.ts` → `projectService` adapter                                          |
| Assistant tools                                                 | In-process   | `apps/web/lib/assistant/tools.ts` → `projectService` adapter                                            |

Repository integration (GitHub/GitLab) is part of Projects and also writes
project activity. `GITHUB_*` / `GITLAB_*` OAuth env vars are read by the
Copilot shell during the transition.

## Calendars

Target: `apps/calendars` / `@workspace/calendars` + `@workspace/meetings`.

### Domain packages (#154)

| Package              | Ships                                                                                                                              | Bound by                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `@workspace/calendars` | Calendar/event/attendee types, Zod schemas, membership and event rules, date/layout helpers                                        | `apps/web/lib/calendars/index.ts` binds `CalendarDb` over the transitional Prisma client   |
| `@workspace/meetings`  | Meeting settings, client requests, proposed slots, booking rules and the meeting-app provider adapters                             | `apps/web/lib/meetings/index.ts` binds `MeetingDb` and Copilot's notification inbox         |

Both packages are Next-free and depend only on `@workspace/core` and
`@workspace/organization`. Repositories take narrow structural ports
(`CalendarDb`, `MeetingDb`), so the same service runs in the calendars app, the
portal (in-process until #190) and Copilot without importing another app's
client. Unit tests use the repository ports.

### Routes and surfaces

| Surface            | Location                                                                                                                                                       | Notes                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Calendars page     | `apps/web/app/[locale]/(app)/[orgSlug]/calendars/{page,loading,not-found}.tsx`                                                                                | Loads its own data through `listCalendarDataAction`; the app layout only mounts an empty provider |
| Meeting inbox      | Dialog on the calendars page (`apps/web/components/meetings/meeting-requests-dialog.tsx`)                                                                    | No route of its own                                                                            |
| Meeting settings   | `apps/web/app/[locale]/(app)/[orgSlug]/settings/page.tsx` + `components/meetings/meeting-settings-form.tsx`                                                   | Owners/admins                                                                                  |
| Portal meetings    | `apps/web/app/[locale]/portal/meetings/page.tsx`                                                                                                              | Server-renders `meetingService.getPortalMeetings`                                              |
| Server actions     | `actions/calendars.ts` (list data/events, create/update/move/delete event, add/toggle calendar, respond) and `actions/meetings.ts` (portal create/cancel, team list/accept/decline, settings get/update) | Set `"use server"`; URLs unchanged |
| API                | `/api/health` only                                                                                                                                            | No dedicated calendar or meeting route                                                         |
| MCP tools          | `list_calendar`, `create_event`, `respond_to_event`, `list_meeting_requests`, `accept_meeting_request`, `decline_meeting_request`, `get_meeting_settings`, `update_meeting_settings` | `apps/web/lib/mcp/tools/{calendars,meetings}.ts`                                               |
| Prisma models      | `Calendar`, `CalendarMember`, `CalendarEvent`, `EventAttendee`, `MeetingSettings`, `MeetingRequest`, `MeetingSlot`, `AuditLog`                                  | `asynchrone_calendars` (`@workspace/db-calendars`)                                             |
| Audit actions      | none today                                                                                                                                                     |                                                                                                |
| Internal endpoints | search / export / delete as above                                                                                                                              | Not wired yet                                                                                  |

## Files

Target: `apps/files` / `@workspace/files`.

| Surface            | Inventory                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages              | `/[orgSlug]/files`                                                                                                                                                                                                             |
| Server actions     | `actions/files.ts` (folders, upload metadata, rename/move/duplicate/star/trash/restore/delete, bulk operations, shares, restricted access)                                                                                     |
| API                | `POST/GET /api/files/uploads`, `GET/PUT/DELETE /api/files/uploads/[uploadId]`, `POST/GET /api/files/uploads/[uploadId]/complete`, `GET /api/files/[fileId]/download`, `GET /api/files/uploads/sweep`, `/api/health`            |
| Cron               | `uploads-sweep` (`/api/files/uploads/sweep`, daily 03:00)                                                                                                                                                                      |
| MCP tools          | `list_files`, `create_folder`, `create_files`, `rename_file`, `move_file`, `trash_file`                                                                                                                                        |
| Prisma models      | `FileNode`, `UploadSession`, `FileShare`, `FileVersion`, `FileActivity`, `AuditLog`                                                                                                                                            |
| Storage            | PostgreSQL large objects in the files database; resumable upload protocol; shared pool from `@workspace/db-core`                                                                                                               |
| Audit actions      | `file.created`, `file.folder.created`, `file.renamed`, `file.moved`, `file.duplicated`, `file.trashed`, `file.restored`, `file.deleted`, `file.access.updated`, `file.share.added`, `file.share.updated`, `file.share.removed` |
| Audit entities     | `file`                                                                                                                                                                                                                         |
| Internal endpoints | search / export / delete as above; large-object deletion must run inside the files app                                                                                                                                         |

## Messages

Target: `apps/messages` / `@workspace/messaging`.

| Surface            | Inventory                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Pages              | `/[orgSlug]/messages`                                                                                           |
| Server actions     | `actions/messaging.ts` (channels, DMs, messages, threads, reactions, read state, typing, presence, mute, pin)   |
| API                | `GET /api/messages/attachments/[attachmentId]`, `/api/health`                                                   |
| MCP tools          | `list_conversations`, `list_messages`, `send_message`, `create_channel`                                         |
| Prisma models      | `ChatTeam`, `Conversation`, `ConversationMember`, `Message`, `MessageReaction`, `MessageAttachment`, `AuditLog` |
| Audit actions      | none today                                                                                                      |
| Internal endpoints | search / export / delete as above; attachments are served by the messages app                                   |

## Clients

Target: `apps/clients` / `@workspace/clients`. Renamed from Clients by #147.

| Surface            | Inventory                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages              | `/[orgSlug]/(clients)/clients`, `clients/[clientId]`, `contacts`, `contacts/[contactId]`, `deals`, `deals/[dealId]`                                                                                                                                         |
| Server actions     | `actions/clients.ts` (clients, contacts, deals, pipelines/stages, custom fields, activities, CSV import/export, document links, project links)                                                                                                              |
| MCP tools          | `get_clients_overview`, `get_client`, `get_deal`, `save_client`, `save_contact`, `save_deal`, `move_deal`, `log_client_activity`, `list_client_documents`, `link_client_document`, `unlink_client_document`, `link_client_project`, `unlink_client_project` |
| Prisma models      | `Client`, `Contact`, `ContactCompany`, `Pipeline`, `PipelineStage`, `Deal`, `DealContact`, `CrmActivity`, `CrmFieldDefinition`, `CrmDocument`, `AuditLog`                                                                                                   |
| Audit actions      | `client.*`, `contact.*`, `deal.*`, `pipeline.*`, `stage.*`, `clientsField.*`, `activity.*`, `client.project.*`, `client.document.linked`                                                                                                                    |
| Audit entities     | `client`, `contact`, `deal`, `pipeline`, `stage`, `clientsField`, `activity`                                                                                                                                                                                |
| Cross-domain reads | project options for `link_client_project`; file options for document linking (both move behind internal APIs)                                                                                                                                               |
| Internal endpoints | search / export / delete as above                                                                                                                                                                                                                           |

`#147` renames the models to `ClientActivity`, `ClientFieldDefinition`,
`ClientDocument` and the tables with an `ALTER TABLE RENAME` migration.

## Employees

Target: `apps/employees` / `@workspace/employees`. Renamed from Employees by #147.

| Surface            | Inventory                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages              | `/[orgSlug]/employees` (becomes `/[orgSlug]/employees` with a permanent redirect)                                                                                                                                         |
| Server actions     | `actions/employees.ts` (attendance, time tracking, payroll, leave, balances, allowances, settings, profiles, salaries, project Employees settings, CSV export)                                                            |
| MCP tools          | `get_employees_overview`, `list_attendance`, `set_attendance`, `request_leave`, `decide_leave`, `get_time_tracking`                                                                                                       |
| Prisma models      | `HrProfile`, `AttendanceEntry`, `LeaveRequest`, `LeaveBalance`, `LeaveAdjustment`, `HrSettings`, `SalaryProfile`, `InternalActivity`, `AuditLog`                                                                          |
| Audit actions      | `client.create`, `client.update` (Employees payroll clients), `project.update`, `settings.update`, `salary.update`, `profile.update`, `balance.set`, `balance.adjust`, `attendance.clear`, `leave.create`, `leave.cancel` |
| Audit entities     | `employeeProfile`, `employeeSettings`, `salaryProfile`, `attendance`, `leaveRequest`, `leaveBalance`, `leaveAdjustment`, `internalActivity`                                                                               |
| Cross-domain reads | project names/tasks for time allocation (internal projects API after the split)                                                                                                                                           |
| Internal endpoints | search / export / delete as above                                                                                                                                                                                         |

`#147` renames the models to `EmployeeProfile` and `EmployeeSettings` and the
tables with an `ALTER TABLE RENAME` migration.

## Control tower

Target: `apps/control-tower`, unchanged in purpose and already isolated from the
customer cookie.

| Surface         | Inventory                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages           | `/sign-in`, `/setup-2fa`, `/(dashboard)/overview`, `/organizations`, `/organizations/[orgId]`, `/users`, `/users/[userId]`, `/audit`, `/ops`, `/`                                                      |
| API             | `/api/auth/[...all]`, `/api/health`                                                                                                                                                                    |
| Server actions  | `apps/control-tower/actions/*` through `withPlatformAction`                                                                                                                                            |
| Auth            | Separate Better Auth instance, host-only cookie, `platform_admin` / `platform_support` roles, mandatory TOTP                                                                                           |
| Prisma models   | `User`, `Session`, `Account`, `Verification`, `TwoFactor`, `Jwks`, `PlatformAuditEvent`, `PlatformHandoff`, `AuditLog` (after #209)                                                                    |
| Platform audit  | `PlatformAuditEvent` only, never the organization `AuditLog`                                                                                                                                           |
| Internal client | `IdentityAdminClient` → Copilot `/internal/v1/admin/*` with `internal:identity:admin`                                                                                                                  |
| Env             | `DATABASE_URL`, `DATABASE_POOL_MAX`, `BETTER_AUTH_URL`, `CONTROL_TOWER_BETTER_AUTH_SECRET`, `PLATFORM_APP_URL`, `CONTROL_TOWER_OAUTH_CLIENT_*`, `PLATFORM_ALLOWED_IPS`, `DEPLOY_ENV`, `GIT_COMMIT_SHA` |
| Tests           | `verify:auth-config`, `verify:platform-authorization`                                                                                                                                                  |

#209 moves the platform auth/audit/handoff tables from the identity database to
`asynchrone_control_tower`.

## Portal

Target: stays in `apps/copilot` (#164). Portal reads come from Projects, Files
and Messages through internal APIs; Copilot keeps the portal session and the
client-company membership.

| Surface        | Inventory                                                                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages          | `/portal`, `/portal/projects/[projectId]`, `/portal/projects/[projectId]/tasks/[taskId]`, `/portal/documents`, `/portal/meetings`                                                                                             |
| Server actions | `actions/portal.ts` (invite, revoke, cancel invite, claim access, post message, mark seen, post task comment)                                                                                                                 |
| API            | `POST /api/portal/documents/upload`, `GET /api/portal/files/[fileId]/download`                                                                                                                                                |
| Library        | `lib/portal/{context,schemas,service,types}.ts`; `lib/portal/context.ts` resolves `Member.clientId`                                                                                                                           |
| Models         | `PortalInvite`, `Member.clientId` (identity); `Client` (clients); `Project`, `Task`, `ProjectMessage`, `TaskComment` (projects); `FileNode` (files)                                                                           |
| Access rules   | per-project client access policy: portal visibility, discussion and task comments each `hidden` / `read` / `read & write`; portal accounts are `role=client` and blocked from the workspace, server actions, file API and MCP |
| Badges         | “new since last visit” state per portal user                                                                                                                                                                                  |
| Audit          | portal message/task-comment mutations currently write no `AuditLog` row; #190 must preserve that behavior or add a deliberate action                                                                                          |
| Tests          | `e2e/member-rbac.spec.ts`, `verify:authorization`, `verify:data-export`, `verify:organization-deletion`                                                                                                                       |

## Internal API map

All routes are versioned under `/internal/v1` and authenticated with a
client-credentials service token (`@workspace/service-auth`). The target app
always applies its own organization, role, visibility and portal rules.

| Endpoint                                 | App         | Handler / contract                                                           | Scope                          | Status                                |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------- | ------------------------------ | ------------------------------------- |
| `GET /organizations/:id`                 | Copilot     | `lib/identity/handler.ts`, `OrganizationSchema`                              | `internal:identity:read`       | implemented                           |
| `GET /organizations/:id/members`         | Copilot     | `lib/identity/handler.ts`, `MemberSchema[]`                                  | `internal:identity:read`       | implemented                           |
| `GET /organizations/:id/entitlements`    | Copilot     | `lib/identity/handler.ts`, `EntitlementsSchema`                              | `internal:identity:read`       | implemented                           |
| `GET /users/:id`                         | Copilot     | `lib/identity/handler.ts`, `UserSchema`                                      | `internal:identity:read`       | implemented                           |
| `GET/POST /admin/organizations...`       | Copilot     | `lib/admin/handler.ts`, `Admin*Schema`                                       | `internal:identity:admin`      | implemented                           |
| `GET/POST /admin/users...`               | Copilot     | `lib/admin/handler.ts`, `Admin*Schema`                                       | `internal:identity:admin`      | implemented                           |
| `POST /admin/handoffs`                   | Copilot     | `lib/admin/handler.ts`, `AdminHandoff*`                                      | `internal:identity:admin`      | implemented                           |
| `GET /audit`                             | each app    | `@workspace/audit` `createAuditListHandler`, `AuditPageSchema`               | `internal:audit:read`          | Copilot only; domain apps after split |
| `GET /audit/facets`                      | each app    | `@workspace/audit`, `AuditFacetsSchema`                                      | `internal:audit:read`          | Copilot only                          |
| `GET /audit/export`                      | each app    | `@workspace/audit`, `AuditExportSchema`                                      | `internal:audit:read`          | Copilot only                          |
| `POST /audit/prune`                      | each app    | `@workspace/audit`, `AuditPruneRequest/ResultSchema`                         | `internal:audit:write`         | Copilot only                          |
| `POST /notifications`                    | Copilot     | `app/internal/v1/notifications/route.ts`, `NotificationInput/ResultSchema`   | `internal:notifications:write` | implemented                           |
| `GET /search`                            | each domain | `@workspace/search` `createSearchHandler`, `SearchResponseSchema`            | `internal:search:read`         | handler exists, not wired             |
| `GET /organizations/:id/export`          | each domain | `@workspace/sagas` `createExportHandler`, `ExportPartSchema`                 | `internal:export:read`         | handler exists, not wired             |
| `DELETE /organizations/:id`              | each domain | `@workspace/sagas` `createDeleteOrganizationHandler`, `DeletionResultSchema` | `internal:delete:write`        | handler exists, not wired             |
| `DELETE /users/:id`                      | each domain | `@workspace/sagas` `createDeleteUserHandler`, `DeletionResultSchema`         | `internal:delete:write`        | handler exists, not wired             |
| Domain CRUD used by assistant/MCP/portal | each domain | to be defined by #190                                                        | `internal:domain:read/write`   | planned                               |

`packages/contracts/src/internal/contracts.ts` owns `INTERNAL_ROUTES` and the
shared schemas; `packages/contracts/src/clients/*` owns the typed clients. Do
not add an ad-hoc route shape.

## Environment variables

| Variable(s)                                                                                                                                                                                                              | Owner / readers                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `DATABASE_POOL_MAX`                                                                                                                                                                                      | transitional monolith (`@workspace/db`), migration job and scripts; per-app `*_DATABASE_URL` replace it by app |
| `IDENTITY_DATABASE_URL`, `PROJECTS_DATABASE_URL`, `CALENDARS_DATABASE_URL`, `FILES_DATABASE_URL`, `MESSAGES_DATABASE_URL`, `CLIENTS_DATABASE_URL`, `EMPLOYEES_DATABASE_URL`, `CONTROL_TOWER_DATABASE_URL`                | the app that owns the database (`@workspace/db-*`)                                                             |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                                                                                                                                                                                  | Copilot (Better Auth/OIDC)                                                                                     |
| `CONTROL_TOWER_BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                                                                                                                                                                    | control tower (separate instance; never reuse the Copilot secret)                                              |
| `LANDING_APP_URL`, `COPILOT_APP_URL`, `PROJECTS_APP_URL`, `CALENDARS_APP_URL`, `FILES_APP_URL`, `MESSAGES_APP_URL`, `CLIENTS_APP_URL`, `EMPLOYEES_APP_URL`, `CONTROL_TOWER_APP_URL`                                      | every app that links across apps / builds `trustedCustomerOrigins`                                             |
| `COPILOT_OAUTH_CLIENT_*`, `PROJECTS_OAUTH_CLIENT_*`, `CALENDARS_OAUTH_CLIENT_*`, `FILES_OAUTH_CLIENT_*`, `MESSAGES_OAUTH_CLIENT_*`, `CLIENTS_OAUTH_CLIENT_*`, `EMPLOYEES_OAUTH_CLIENT_*`, `CONTROL_TOWER_OAUTH_CLIENT_*` | each OIDC client, provisioned by `oauth:clients`                                                               |
| `OAUTH_TRUSTED_CLIENT_IDS`                                                                                                                                                                                               | Copilot OAuth server                                                                                           |
| `OPENAI_API_KEY`, `OPENAI_API_URL`, `ASSISTANT_MODEL`, `MCP_RESOURCE_URL`                                                                                                                                                | Copilot (assistant + MCP)                                                                                      |
| `CRON_SECRET`                                                                                                                                                                                                            | every CronJob endpoint                                                                                         |
| `GITHUB_CLIENT_ID/SECRET`, `GITLAB_CLIENT_ID/SECRET`                                                                                                                                                                     | Copilot today; Projects with the repository integration                                                        |
| `RESEND_API_KEY`, `EMAIL_FROM`, `FEEDBACK_EMAIL_TO`, `NEXT_PUBLIC_APP_URL`, `REQUIRE_EMAIL_VERIFICATION`                                                                                                                 | Copilot (email, feedback, links)                                                                               |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_PRICE_TEAM_YEARLY`, `STRIPE_AUTOMATIC_TAX`                                                      | Copilot (billing)                                                                                              |
| `TURNSTILE_SITE_KEY/SECRET`, `SIGNUP_INVITE_ONLY`, `SIGNUP_BLOCKED_EMAIL_DOMAINS`                                                                                                                                        | Copilot (sign-up policy)                                                                                       |
| `TRUSTED_IP_HEADERS`                                                                                                                                                                                                     | Copilot + control tower (rate limiting / allowlist)                                                            |
| `PLATFORM_APP_URL`, `CONTROL_TOWER_URL`, `PLATFORM_ALLOWED_IPS`                                                                                                                                                          | control tower + Copilot (handoff links)                                                                        |
| `DEPLOY_ENV`, `GIT_COMMIT_SHA`, `SENTRY_DSN` (`NEXT_PUBLIC_SENTRY_DSN` at build)                                                                                                                                         | every app / ops                                                                                                |
| `E2E_BASE_URL`, `E2E_PORT`                                                                                                                                                                                               | Playwright only                                                                                                |

Rules: add new variables to `turbo.json` (`build` and `dev`), `.env.example`
and the build-time placeholders in `Dockerfile` / CI when read at build time.
Never bake secrets into an image.

## Tests

| Suite                     | Location                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — Copilot shell      | `apps/web/lib/{account,admin,audit,auth,billing,email,identity,oauth,organization,search}*.unit.test.ts`                                     |
| Unit — Projects           | `packages/projects/src/{service,sync}.unit.test.ts` (task authorization, repository sync primitives); e2e and scripts cover the rest              |
| Unit — Files              | `apps/web/lib/files/duplicate.unit.test.ts`                                                                                                  |
| Unit — Calendars/Meetings | `packages/calendars/src/service.unit.test.ts` (personal calendar creation, membership mapping, attendee response, role/cross-org guards); `packages/meetings/src/service.unit.test.ts` (request rules, conflict flags, notification fan-out, booking, decline) |
| Unit — shared packages    | `packages/{ai,app-shell,appearance,audit,auth,billing,contracts,core,db-core,integrations,notifications,oidc,organization,sagas,search,service-auth,storage}/**/*.unit.test.ts` |
| E2E                       | `apps/web/e2e/{a11y,audit-log,member-rbac,password-reset,upload}.spec.ts`                                                                    |
| Verification scripts (DB) | `apps/web/scripts/verify-{authorization,audit-log,trial,data-export,organization-deletion,account-deletion,large-object,repository-sync}.ts` |
| Legal copy                | `apps/web/scripts/verify-legal-copy.ts`                                                                                                      |
| Control tower             | `apps/control-tower/scripts/verify-{auth-config,platform-authorization}.ts`                                                                  |
| Boundaries                | `scripts/check-boundaries.mjs`                                                                                                               |
| Prisma/migrations         | `scripts/{verify-prisma-schemas,verify-migrations}.mjs`                                                                                      |

There is no general test script. Add a unit test next to a non-trivial
extraction; #159 and #210 add the cross-domain and end-to-end coverage.

## Parity checklist

Each app is “done” only when every row is checked. The owning issue is in
parentheses; keep the checklist honest rather than pre-checking it.

### Landing (#176, #167)

- [ ] Marketing routes render from `apps/landing` with no session or database.
- [ ] MDX content, legal copy/PDFs and locale mirroring are unchanged.
- [ ] No `@workspace/db-*`, auth or API route is imported.
- [ ] Links to Copilot use `COPILOT_APP_URL`.

### Copilot (#149, #150, #151, #152, #175, #164, #165, #166, #190)

- [ ] Auth, 2FA, onboarding, organization selection, settings, billing, audit,
      search, help, feedback, MCP, platform handoff and the assistant run here.
- [ ] OIDC authorization server, JWKS, consent and token lifecycle are unchanged.
- [ ] The portal stays here and calls domain internal APIs.
- [ ] Conversations persist and the server owns model history.
- [ ] No domain Prisma import remains after #190.

### Projects (#153, #160)

- [x] Repository, service, schemas, types, project/task UI and repository sync
      live in `@workspace/projects`; app adapters bind db, auth, audit,
      notifications and env (#153).
- [ ] Pages, actions, MCP tools, repository webhooks and `repository-sync` cron.
- [ ] `Project`/`Task`/`ProjectMessage`/repository models live in
      `asynchrone_projects`.
- [ ] Audit rows are written in the projects database and served by
      `/internal/v1/audit`.
- [ ] Search, export and deletion endpoints are wired.
- [ ] Assistant, MCP and portal reach it through internal clients.

### Calendars (#154, #161)

- [ ] Calendar and meeting pages/actions/MCP tools.
- [ ] Calendar/event/meeting models in `asynchrone_calendars`.
- [ ] Search, export and deletion endpoints are wired.
- [ ] Meeting scheduling does not read another app's database.

### Files (#155, #161)

- [ ] File pages/actions, resumable upload API, download endpoint and sweep cron.
- [ ] Large objects, versions, shares and activity live in `asynchrone_files`.
- [ ] Portal upload/download still enforces the client-visible link.
- [ ] Export and deletion unlink every large object.
- [ ] Search endpoint is wired.

### Messages (#156, #162)

- [ ] Messages page/actions, attachment endpoint and MCP tools.
- [ ] Conversations/messages/reactions/attachments in `asynchrone_messages`.
- [ ] Portal discussion reads use an internal messages call.
- [ ] Search, export and deletion endpoints are wired.

### Clients (#157, #163)

- [ ] `#147` rename has landed and no `clients*` identifier remains.
- [ ] Clients/contacts/deals/pipelines/fields/activities pages, actions and MCP tools.
- [ ] Models live in `asynchrone_clients`; document links reference files by id only.
- [ ] Project linking uses the projects internal API.
- [ ] Audit, search, export and deletion endpoints are wired.

### Employees (#157, #163)

- [ ] `#147` rename has landed and no `employees*` identifier remains.
- [ ] Attendance, leave, capacity, payroll, settings, profile and CSV export.
- [ ] Models live in `asynchrone_employees`.
- [ ] Project allocation uses the projects internal API.
- [ ] Audit, search, export and deletion endpoints are wired.

### Control tower (#209, #210)

- [x] Signs in with only `asynchrone_control_tower`.
- [x] Platform audit rows live there; handoff rows are created by Copilot and
      copied for schema parity (ADR 0034).
- [x] Customer identity reads and mutations go through `IdentityAdminClient`.
- [x] No control-tower code imports the identity database.
- [x] `verify:auth-config` and `verify:platform-authorization` pass.

## Known coupling that must disappear

These are the concrete blockers the inventory exposes. They are covered by the
phase issues rather than fixed in #146.

1. `apps/web/lib/prisma.ts` re-exports `@workspace/db` (the monolith schema).
   Domain pages and actions still read every table through that one client.
2. The assistant (`lib/assistant/tools.ts`) and MCP tools import the Projects,
   Files and Messages services in-process; calendar tools import
   `@workspace/calendars` and meeting tools `@workspace/meetings` through the
   app adapters. All of them still run inside Copilot instead of the domain
   internal API (#190).
3. The portal service reads project/files data in-process.
4. Search, export and deletion handlers exist in packages but only Copilot's
   audit/identity endpoints are wired; domain endpoints arrive with each app.
5. The control tower still uses the identity database for its own auth tables.
6. Notifications are written directly to the identity database by the Copilot
   web app; domain apps must use `POST /internal/v1/notifications`.

The #147 rename is complete: the route group is `(clients)`, the folders are
`lib/clients` and `lib/employees`, the tables are `clientActivity`,
`clientFieldDefinition`, `clientDocument`, `employeeProfile` and
`employeeSettings`, and the MCP tools use `clients_*` / `employees_*`.

## How to update this document

- Moving a page, action, route, tool or model: update its row in the same PR.
- Adding a surface: add it to exactly one app, plus its audit and test rows.
- Adding an internal endpoint: add it to `INTERNAL_ROUTES`, a Zod contract and
  the internal API map before wiring the handler.
- Removing the transitional shim: delete the row from “Known coupling”.
