# Feature inventory and parity checklist

Last audited: 2026-11-02 (issues #146–#163).
This document is the surface inventory for the domain-app split. Every route,
server action, API handler, cron job, MCP tool, Prisma model, audit action,
portal surface, internal endpoint, environment variable and test is assigned to
exactly one app. It is a snapshot of the finished split: every customer app
runs on its own host with its own database, Copilot owns identity and the
portal, and cross-domain reads go through the versioned internal APIs in
`@workspace/contracts`.

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

`apps/landing`, `apps/copilot`, `apps/projects`, `apps/calendars`, `apps/files`,
`apps/messages`, `apps/clients`, `apps/employees` and `apps/control-tower` exist
today. Copilot keeps only the workspace shell, identity and the portal; the
portal stays inside Copilot (there is no `apps/portal`).

## Landing

Target: `apps/landing`, stateless. No session, no database, no internal API.

| Surface         | Current location                                                                                                        | Notes                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Marketing pages | `apps/landing/app/[locale]/(marketing)/*`                                                                               | home, about, blog, blog/[slug], careers, contact, FAQ, features, legal/[slug], pricing |
| Content         | `apps/landing/content/blog/<locale>`                                                                                    | MDX mirrored in `en` and `fr`                                                          |
| Legal copy/PDFs | `apps/landing/lib/landing/legal.ts`, `packages/i18n/messages/{en,fr}/legal.json`, `apps/landing/public/downloads/legal` | `verify:legal-copy`, `legal:pdfs`                                                      |
| Layout/metadata | `apps/landing/app/[locale]/(marketing)/layout.tsx`, `apps/landing/mdx-components.tsx`                                   |                                                                                        |

No server actions, API routes, cron jobs, MCP tools, Prisma models or audit
actions. Keeping the landing database-free is an acceptance criterion of #176
and #167.

## Copilot

Target: `apps/copilot` (renamed from `apps/web` in #175). Owns the identity database and
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

`apps/copilot/actions/account.ts`, `appearance.ts`, `audit.ts`, `billing.ts`,
`data-export.ts`, `feedback.ts`, `notifications.ts`,
`organization-deletion.ts`, `trial.ts`, `two-factor-policy.ts`.

They cover account deletion, organization appearance, audit list/facets/export/
retention, billing checkout/portal/sync, data export requests, feedback,
notifications, organization deletion scheduling/cancelling, trial start and the
organization 2FA policy.

### API routes

| Route                                                 | Method   | Owner                         |
| ----------------------------------------------------- | -------- | ----------------------------- |
| `/api/assistant`                                      | POST     | Copilot (assistant run)       |
| `/api/assistant?conversationId=`                      | GET      | Copilot (assistant reload)    |
| `/api/assistant/conversations`                        | GET/POST | Copilot (conversation list/create) |
| `/api/assistant/conversations/[conversationId]`       | DELETE   | Copilot (conversation delete) |
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

### Fleet authentication (#169)

| Surface | Behaviour |
| --- | --- |
| App session cookie | Host-only `__Host-asynchrone_session` over HTTPS (`asynchrone_session` on local HTTP), never a `Domain=` attribute or a shared `.copilot` cookie. |
| Token verification | `@workspace/oidc` verifies signature, `iss` (`<copilot>/api/auth`), `aud` (`urn:asynchrone:app:<key>`), `exp` with 60s skew, and binds `sub`/`sid`/`org` to the local row on every request. A token for another app, another sign-in or another organization is rejected and the local row is deleted. |
| Refresh | Rotating refresh token; a failed refresh deletes the local session and sends the user to Copilot. |
| Back-channel logout | `POST /api/auth/backchannel-logout` verifies the signed logout token and deletes every session by `sid`. Copilot dispatches it through `session.delete.after` (sign-out, admin revocation, stop-impersonation). |
| Organization switch | The app's `/api/auth/switch` deletes its local session and clears the cookie; Copilot's `/organization/set-active` then calls each domain app's `POST /internal/v1/auth/revoke` with the `sid`. |
| Impersonation | One-hour TTL from the Copilot session's creation, enforced by every workspace resolver; stop-impersonation deletes the session through Better Auth (back-channel logout) plus the revocation fan-out. |
| 2FA | The authorize hook redirects unenrolled members; every app also enforces the token's `twoFactorRequired`/`twoFactorEnrolled` claims together with the current organization policy. Impersonating staff are exempt. |
| Internal APIs | Audience-bound client-credentials tokens via `@workspace/service-auth`; `iss` is `<copilot>/api/auth`; a token for one app is rejected by another. |
| Config guard | `npm run verify:auth-config --workspace=control-tower` asserts the control-tower invariants and the fleet rules above. |

### Assistant and MCP

- Assistant agent/tools: `@workspace/ai` (chat parts, stream reducer, pricing,
  agent factory and the quota ledger) plus `apps/copilot/lib/assistant/*` (tools,
  persistence and app wiring) and `apps/copilot/app/api/assistant/route.ts`.
- History is server-owned: `POST /api/assistant` accepts `{ conversationId?,
  text }`, loads the stored turns and persists the accepted user message before
  the model call and the assistant parts when the stream completes.
  `GET /api/assistant?conversationId=…` reloads the current conversation for the
  `AssistantProvider` (`packages/ai/src/use-assistant.tsx`), which keeps only the
  conversation id in `localStorage` per organization. Every read and write is
  scoped to the active organization and the signed-in user; see
  [assistant](../assistant.md).
- `/api/assistant/conversations` lists and creates conversations;
  `DELETE /api/assistant/conversations/:id` deletes one and cascades its
  messages. The organization home (`/{locale}/{orgSlug}`) loads the list on the
  server, renders the streaming transcript and tool cards, and exposes new chat,
  reopen and delete with the same organization/user isolation. Copilot is the
  home; there is no separate shell redirect, and `/mcp` stays here.
- Assistant tools call `/internal/v1/domain/:operation` through `DomainClient`:
  `list_projects`, `get_project`, `list_tasks`, `create_project`,
  `create_task`, `update_task`, `move_task`, `list_calendar`, `create_event`,
  `list_files`, `list_conversations`, `send_message`.
- MCP transport: `apps/copilot/app/mcp/route.ts`, `apps/copilot/lib/mcp/*`.
- MCP tools (44) live in `apps/copilot/lib/mcp/tools/*` and are listed per domain
  below.
- #190/#171 moved every tool onto the typed internal clients; the MCP
  transport and assistant stay in Copilot.

### Prisma models (identity database)

`User`, `Session`, `Account`, `Verification`, `Organization`, `TrialClaim`,
`Team`, `TeamMember`, `Member`, `Invitation`, `Notification`, `PortalInvite`,
`Jwks`, `OauthClient`, `OauthResource`, `OauthClientResource`,
`OauthRefreshToken`, `OauthAccessToken`, `OauthConsent`,
`OauthClientAssertion`, `TwoFactor`, `CustomerTwoFactor`, `Subscription`,
`Invoice`, `BillingEvent`, `AiUsageEvent`, `AssistantConversation`,
`AssistantMessage`, `RateLimit`, `DataExport`,
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

| Package                    | Ships                                                                      | Bound by                                                            |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `@workspace/storage`       | PostgreSQL large-object engine for file bytes                              | Files and messages apps, each bound to its own pool                    |
| `@workspace/notifications` | Inbox types, schemas and the notification service over a repository port   | Copilot's identity repository; domain apps use `NotificationClient` |
| `@workspace/integrations`  | Provider protocol, GitHub/GitLab clients and the token cipher              | The app that owns the connection; tokens stay in its database       |
| `@workspace/ai`            | Chat parts, model pricing, agent factory and the quota ledger over a store | Copilot's `AiUsageEvent`; tools call domain APIs (#190)             |
| `@workspace/appearance`    | Organization appearance types, schemas and service over a metadata store   | Copilot's `Organization.metadata`                                   |
| `@workspace/billing`       | Plans, types, webhook payloads and the subscription state machine          | Copilot's Prisma repository + Stripe provider                       |
| `@workspace/audit`         | Audit writer/reader, retention, HTTP handlers and cross-app fan-out        | Each app's own `AuditLog`; Copilot aggregates                       |

## Projects

Target: `apps/projects` / `@workspace/projects`.

Extracted in #153, moved to its own app in #160: pages, actions, shell, OIDC
session and deployment live in `apps/projects`, which serves
`projects.copilot.asynchrone.space/{locale}/{orgSlug}/projects`. Copilot keeps
only a redirect (`apps/copilot/proxy.ts`); the assistant, MCP and portal call
its `/internal/v1/domain/:operation` API (#190).

Identity reads (member list, invitations/roles, personal repository tokens) go
through `IdentityClient`; the app binds only `@workspace/db-projects`.

| Surface            | Inventory                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server actions     | `apps/projects/actions/{projects,project-messages,integrations}.ts` (projects, tasks, members, labels, templates, comments, project discussion thread, repository connections)                                                                                      |
| Pages              | `apps/projects/app/[locale]/[orgSlug]/projects[/\[projectId\]]` (list, workspace, loading, not-found); Copilot 308-redirects the old paths                                                                                                                         |
| Auth               | `apps/projects/app/api/auth/{sign-in,callback,logout,backchannel-logout,switch}`, `lib/auth/workspace.ts` (2FA gate, organization binding)                                                                                                                           |
| API                | Projects: `POST /api/webhooks/repositories/[connectionId]`, `GET /api/cron/repository-sync` (hourly since #168), `/api/health`; the webhook moved here in #171 |
| MCP tools          | `list_projects`, `get_project`, `list_tasks`, `create_project`, `create_task`, `update_task`, `move_task`                                                                                                                                                           |
| Prisma models      | `Project`, `ProjectMember`, `Label`, `ProjectLabel`, `Task`, `TaskIdentifierCounter`, `TaskTemplate`, `TaskLabel`, `Subtask`, `TaskComment`, `ProjectActivity`, `ProjectMessage`, `RepositoryConnection`, `UserRepositoryToken`, `AuditLog`                         |
| Audit actions      | `project.created`, `project.updated`, `project.deleted`, `project.client_settings.updated`, `project.member.*`, `project.label.*`, `project.template.*`, `task.created`, `task.updated`, `task.moved`, `task.deleted`, `task.subtask.toggled`, `task.comment.added`, `project.message.added` |
| Audit entities     | `project`, `task`, `label`, `taskTemplate`                                                                                                                                                                                                                          |
| Internal endpoints | `GET /internal/v1/search`, `GET /organizations/:id/export`, `DELETE /organizations/:id`, `DELETE /users/:id`, the audit routes and the file content stream                                                             |

### Package layout (#153)

| Module                                            | Exports                                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/projects/src/types.ts`                  | Project, task, template, label, comment, activity and member types plus enum values                                           |
| `packages/projects/src/schemas.ts`                | Zod inputs for projects, tasks, templates, labels, members, comments and portal policies                                      |
| `packages/projects/src/repository.ts`             | `ProjectRepository` over the structural `ProjectDb` port                                                                      |
| `packages/projects/src/service.ts`                | `ProjectService`; audit, notification and repository-sync ports are injected                                                  |
| `packages/projects/src/task-comments.ts`          | `listTaskComments` / `createTaskComment` over the injected db + notifier                                                      |
| `packages/projects/src/thread.ts`                 | `listProjectMessages` / `createProjectMessage` over the injected db + notifier                                                |
| `packages/projects/src/task-key.ts`               | Shared identifier prefix/allocation used by the service and repository sync                                                   |
| `packages/projects/src/integrations/*`            | `RepositoryConnectionRepository`, `RepositoryIntegrationService`, `RepositoryWebhookHandler`, sync helpers, schemas and types |
| `packages/projects/src/ui/store.tsx`              | `ProjectStoreProvider` / `useProjectStore`; takes the app's server actions as a port and exposes `canManageMembers`           |
| `packages/projects/src/ui/actions.tsx`            | `ProjectActions` contract + `useProjectActions()`                                                                             |
| `packages/projects/src/components/*`              | Project and task UI (board, list, calendar, details, dialogs, settings, templates, labels, repository and discussion)         |
| `apps/projects/lib/{projects,integrations}`           | App adapters: bind the project database, identity directory, audit writer, notification ingress and repository sync; the webhook route lives here |
| `apps/projects/lib/auth/*`                            | OIDC session, return-to cookie, workspace gates and request context                                                           |
| `apps/projects/lib/project-actions.ts`                | Binds the app's server actions to the package's `ProjectActions` port                                                         |

App-only imports are forbidden in the package (`npm run check:boundaries`).
`member`, `user` and `account` are not in the `ProjectDb` port: the project
member list and personal repository tokens go through `IdentityClient`.

### Routes

| Route                                                        | Kind        | Inventory                                                                                                |
| ------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------- |
| `/[locale]/(app)/[orgSlug]/projects`                         | Page        | `projects/page.tsx`; grid + create dialog from `@workspace/projects/components/project`                  |
| `/[locale]/(app)/[orgSlug]/projects/loading`                 | Loading     | `projects/loading.tsx`                                                                                   |
| `/[locale]/(app)/[orgSlug]/projects/[projectId]`             | Page        | `projects/[projectId]/page.tsx`; guards with `projectService.get`, renders `ProjectWorkspace`            |
| `/[locale]/(app)/[orgSlug]/projects/[projectId]/loading`     | Loading     | `projects/[projectId]/loading.tsx`                                                                       |
| `/[locale]/(app)/[orgSlug]/projects/[projectId]/not-found`   | Not found   | `projects/[projectId]/not-found.tsx`                                                                     |
| `/[locale]/portal/projects/[projectId]`                      | Portal page | `portal/projects/[projectId]/page.tsx`; reads `portalService` (projects thread/comments)                 |
| `/[locale]/portal/projects/[projectId]/tasks/[taskId]`       | Portal page | `portal/.../tasks/[taskId]/page.tsx`; reads `portalService` + task comments                              |
| `/[locale]/(app)/layout`                                     | Layout      | Builds `PROJECT_ACTIONS` from the app's server actions and passes them + `canManageMembers` to the store |
| `POST /api/webhooks/repositories/[connectionId]`             | API         | `repositoryWebhookHandler` from the package adapter                                                      |
| `GET /api/cron/repository-sync`                              | Cron        | Projects app: `repositoryIntegrationService.syncAllConnections()`; hourly `CRON_SECRET` job (#168)        |
| `/api/health`                                                | API         | App health check (not project domain)                                                                    |
| MCP `/mcp` (`list_projects`, `get_project`, `list_tasks`, …) | MCP tools   | `apps/copilot/lib/mcp/tools/projects.ts` → `projectService` adapter                                          |
| Assistant tools                                              | In-process  | `apps/copilot/lib/assistant/tools.ts` → `projectService` adapter                                             |

Repository integration (GitHub/GitLab) is part of Projects and also writes
project activity. `GITHUB_*` / `GITLAB_*` OAuth env vars are read by the
Copilot shell during the transition.

## Calendars

Target: `apps/calendars` / `@workspace/calendars` + `@workspace/meetings`.

### Domain packages (#154)

| Package                | Ships                                                                                                  | Bound by                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `@workspace/calendars` | Calendar/event/attendee types, Zod schemas, membership and event rules, date/layout helpers            | `apps/calendars/lib/calendars/index.ts` binds `CalendarDb`; the assistant, MCP and portal use the delegated internal API (#190) |
| `@workspace/meetings`  | Meeting settings, client requests, proposed slots, booking rules and the meeting-app provider adapters | `apps/calendars/lib/meetings/index.ts` binds `MeetingDb` and the notification inbox; the portal and MCP call it through the internal API (#190) |

Both packages are Next-free and depend only on `@workspace/core` and
`@workspace/organization`. Repositories take narrow structural ports
(`CalendarDb`, `MeetingDb`), so the same service runs in the calendars app, the
portal (through the calendars internal API) and Copilot without importing
another app's client. Unit tests use the repository ports.

### Routes and surfaces

| Surface            | Location                                                                                                                                                                                                 | Notes                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Calendars page     | `apps/calendars/app/[locale]/[orgSlug]/calendars/{page,loading,not-found}.tsx`                                                                                                                              | Loads its own data through `listCalendarDataAction`; Copilot 308-redirects the old path             |
| Meeting inbox      | Dialog on the calendars page (`apps/calendars/components/meetings/meeting-requests-dialog.tsx`)                                                                                                              | No route of its own                                                                               |
| Meeting settings   | `apps/calendars/app/[locale]/[orgSlug]/calendars/settings/page.tsx` + `apps/calendars/components/meetings/meeting-settings-form.tsx`                                                                        | Owners/admins; Copilot's organization settings tab links here                                     |
| Portal meetings    | `apps/copilot/app/[locale]/portal/meetings/page.tsx`                                                                                                                                                         | Server-renders `meetingService.getPortalMeetings`; client request/cancel actions stay in Copilot  |
| Server actions     | `apps/calendars/actions/calendars.ts` (list data/events, create/update/move/delete event, add/toggle calendar, respond), `actions/meetings.ts` (team list/accept/decline, settings get/update) and `actions/project-tasks.ts` (task overlay) | Set `"use server"`; paths unchanged on the calendars host |
| API                | `/api/health` only                                                                                                                                                                                       | No dedicated calendar or meeting route                                                            |
| MCP tools          | `list_calendar`, `create_event`, `respond_to_event`, `list_meeting_requests`, `accept_meeting_request`, `decline_meeting_request`, `get_meeting_settings`, `update_meeting_settings`                     | `apps/copilot/lib/mcp/tools/{calendars,meetings}.ts`                                                  |
| Prisma models      | `Calendar`, `CalendarMember`, `CalendarEvent`, `EventAttendee`, `MeetingSettings`, `MeetingRequest`, `MeetingSlot`, `OidcSession`, `RateLimit`, `AuditLog`                                      | `asynchrone_calendars` (`@workspace/db-calendars`)                                                |
| Audit actions      | `calendar.created`, `calendar.updated`, `calendar.event.created`, `calendar.event.updated`, `calendar.event.deleted`, `calendar.event.responded`, `meeting.settings.updated`, `meeting.request.created/accepted/declined/cancelled` | written by the calendars app |
| Internal endpoints | search / export / delete as above                                                                                                                                                                        | Not wired yet                                                                                     |

## Files

Target: `apps/files` / `@workspace/files`. The package landed in #155 and the
screens, actions, upload/download APIs and the `uploads-sweep` route moved to
`apps/files` in #161, bound through `apps/files/lib/files.ts` and
`apps/files/components/files-provider.tsx`. The portal, assistant and MCP call
the files internal API (#190); search/export/deletion run inside the files app.

| Surface                                       | Location                                                                                                                                                                                                                       | Notes                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Page                                          | `apps/files/app/[locale]/[orgSlug]/files/{page,loading,not-found}.tsx`                                                                                                                                                             | renders `@workspace/files/components/files-workspace`; Copilot 308-redirects the old path                  |
| `POST /api/files/uploads`                     | `apps/files/app/api/files/uploads/route.ts`                                                                                                                                                                                      | starts a chunked upload session (`createUploadSession`)                                                    |
| `GET /api/files/uploads`                      | `apps/files/app/api/files/uploads/route.ts`                                                                                                                                                                                      | 405; the session is resumable through the uploadId routes                                                  |
| `GET /api/files/uploads/[uploadId]`           | `apps/files/app/api/files/uploads/[uploadId]/route.ts`                                                                                                                                                                           | resumable session state                                                                                    |
| `PUT /api/files/uploads/[uploadId]`           | `apps/files/app/api/files/uploads/[uploadId]/route.ts`                                                                                                                                                                           | one ordered chunk (`x-chunk-offset`)                                                                       |
| `DELETE /api/files/uploads/[uploadId]`        | `apps/files/app/api/files/uploads/[uploadId]/route.ts`                                                                                                                                                                           | aborts and unlinks the partial large object                                                                |
| `POST /api/files/uploads/[uploadId]/complete` | `apps/files/app/api/files/uploads/[uploadId]/complete/route.ts`                                                                                                                                                                  | validates bytes and creates the file (or returns the attachment oid)                                       |
| `GET /api/files/uploads/[uploadId]/complete`  | `apps/files/app/api/files/uploads/[uploadId]/complete/route.ts`                                                                                                                                                                  | 405                                                                                                        |
| `GET /api/files/[fileId]/download`            | `apps/files/app/api/files/[fileId]/download/route.ts`                                                                                                                                                                            | streams the file’s large object after an access check                                                      |
| `GET /api/files/uploads/sweep`                | `apps/files/app/api/files/uploads/sweep/route.ts`                                                                                                                                                                                | unlinks expired upload sessions (`CRON_SECRET`-guarded)                                                    |
| `GET /api/portal/files/[fileId]/download`     | `apps/copilot/app/api/portal/files/[fileId]/download/route.ts`                                                                                                                                                                     | portal-owned; `@workspace/portal` resolves the client-visible link and streams its large object            |
| Server actions                                | `apps/files/actions/files.ts`                                                                                                                                                                                                    | folders, upload metadata, rename/move/duplicate/star/trash/restore/delete, bulk, shares, restricted access |
| Cron                                          | `uploads-sweep` (files app, `/api/files/uploads/sweep`, daily 03:00, `CRON_SECRET`); the files app owns the CronJob since #161                                                                                                   |                                                                                                            |
| MCP tools                                     | `apps/copilot/lib/mcp/tools/files.ts`                                                                                                                                                                                              | `list_files`, `create_folder`, `create_files`, `rename_file`, `move_file`, `trash_file`                    |
| Prisma models                                 | `FileNode`, `UploadSession`, `FileShare`, `FileVersion`, `FileActivity`, `RateLimit`, `OidcSession`, `AuditLog`                                                                                                                  | `asynchrone_files` (`@workspace/db-files`)                                                               |
| Storage                                       | `packages/files/src/objects.ts` + `@workspace/storage`                                                                                                                                                                         | PostgreSQL large objects; resumable uploads; the app binds its own pool                                    |
| Audit actions                                 | `file.created`, `file.folder.created`, `file.renamed`, `file.moved`, `file.duplicated`, `file.trashed`, `file.restored`, `file.deleted`, `file.access.updated`, `file.share.added`, `file.share.updated`, `file.share.removed` |                                                                                                            |
| Audit entities                                | `file`                                                                                                                                                                                                                         |                                                                                                            |
| Internal endpoints                            | search / export / delete as above                                                                                                                                                                                              | large-object deletion (`snapshotForOrganization`) must run inside the files app                            |

## Messages

Target: `apps/messages` / `@workspace/messaging`. The package landed in #156 and
the app in #162 (`messages.copilot.asynchrone.space`). The app binds only
`@workspace/db-messages`; attachments and their upload sessions live there.

| Surface                                        | Location                                                                                                        | Notes                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Page                                           | `apps/messages/app/[locale]/[orgSlug]/messages/page.tsx`                                                       | renders `apps/messages/components/messaging-workspace.tsx`, which binds the package's `MessagingWorkspace`                                |
| Loading                                        | `apps/messages/app/[locale]/[orgSlug]/messages/loading.tsx`                                                    | route-level skeleton                                                                                                                 |
| `GET /api/messages/attachments/[attachmentId]` | `apps/messages/app/api/messages/attachments/[attachmentId]/route.ts`                                                 | streams one attachment after an organization-scoped lookup (`messagingService.openAttachment`)                                       |
| `POST/PUT/DELETE /api/files/uploads*`          | `apps/messages/app/api/files/uploads/**`                                                                             | transient-only chunked upload sessions for attachments (`@workspace/files`)                                                          |
| `GET /api/messages/snapshot`                   | `apps/messages/app/api/messages/snapshot/route.ts`                                                                   | the sidebar's five-second poll (`messagingService.list`); a route handler, never a server action                                      |
| `GET /api/messages/conversations/[id]`         | `apps/messages/app/api/messages/conversations/[conversationId]/route.ts`                                             | one conversation page for polling and "load earlier"; organization-scoped                                                           |
| `POST /api/messages/presence`                  | `apps/messages/app/api/messages/presence/route.ts`                                                                   | the presence heartbeat (`touchPresence`), cross-origin rejected                                                                      |
| Server actions                                 | `apps/messages/actions/messaging.ts`                                                                                 | mutations only: channels, DMs, messages, threads, reactions, read state, typing, mute, pin                                            |
| Sidebar                                        | `apps/messages/components/app-sidebar.tsx`                                                                           | renders `ConversationSidebar`; the app switcher links the other hosts                                                                 |
| MCP tools                                      | `apps/copilot/lib/mcp/tools/messaging.ts`                                                                           | `list_conversations`, `list_messages`, `send_message`, `create_channel`                                                              |
| Assistant tools                                | `apps/copilot/lib/assistant/tools.ts`                                                                               | `list_conversations`, `send_message` over the same read/write service                                                                |
| Package read API                               | `packages/messaging/src/service.ts`                                                                             | `list`, `listConversations`, `listMessages`, `messagesFor`, `listThreadReplies`, `listTeams`                                         |
| Package write API                              | `packages/messaging/src/service.ts`                                                                             | `sendMessage`, `editMessage`, `deleteMessage`, `toggleReaction`, `addThreadReply`, `markRead`, DM/channel, mute/pin, `touchPresence` |
| Attachments                                    | `packages/messaging/src/service.ts`, `../files/src/upload-client.ts` (`uploadAttachment`)                       | metadata in `messageAttachment`; bytes are PostgreSQL large objects through `@workspace/storage`                                     |
| Storage binding                                | `packages/messaging/src/deps.ts` → `createMessagingRuntime`                                                     | the app binds `apps/messages/lib/large-object.ts`; the package never opens a pool                                                        |
| Prisma models                                  | `ChatTeam`, `Conversation`, `ConversationMember`, `Message`, `MessageReaction`, `MessageAttachment`, `UploadSession`, `RateLimit`, `OidcSession`, `AuditLog` | `asynchrone_messages` (`@workspace/db-messages`)                                                                                        |
| Export/delete bytes                            | `packages/messaging/src/objects.ts`                                                                             | `listAttachmentsForExport` and `snapshotForOrganization`; Copilot keeps the binding for its export/deletion sagas                       |
| Audit actions                                  | `message.sent`, `message.edited`, `message.deleted`, `message.replied`, `message.reaction.toggled`, `conversation.created` | written by the messages app |
| Internal endpoints                             | search / export / delete as above; attachments are served by the messages app                                   |                                                                                                                                      |
| Tests                                          | `packages/messaging/src/service.unit.test.ts`, `apps/messages/e2e/messages.spec.ts`                             | membership, unread state, threads, attachment upload/download, cross-org authorization, sign-in/org switch/redirect                   |

## Clients

Live at `apps/clients` (`clients.copilot.asynchrone.space`, #163) with
`@workspace/clients`. Renamed from CRM by #147 and extracted in #157.

The package owns the CRM clients, contacts, pipelines, deals, activities, field
definitions, documents, access checks, schemas, services, CSV/date helpers,
types and UI. The app owns the server actions, the pages, the organization
shell, the host-only OIDC session and the audit/notification wiring.

| Surface            | Inventory                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages              | `/[orgSlug]/(clients)/clients`, `clients/[clientId]`, `contacts`, `contacts/[contactId]`, `deals`, `deals/[dealId]` (per-route rows below)                                                                                                                  |
| Server actions     | `apps/clients/actions/clients.ts` (clients, contacts, deals, pipelines/stages, custom fields, activities, CSV import/export, document links, project links)                                                                                              |
| MCP tools          | `get_clients_overview`, `get_client`, `get_deal`, `save_client`, `save_contact`, `save_deal`, `move_deal`, `log_client_activity`, `list_client_documents`, `link_client_document`, `unlink_client_document`, `link_client_project`, `unlink_client_project` |
| Prisma models      | `Client`, `Contact`, `ContactCompany`, `Pipeline`, `PipelineStage`, `Deal`, `DealContact`, `ClientActivity`, `ClientFieldDefinition`, `ClientDocument`, `AuditLog`                                                                                          |
| Audit actions      | `client.*`, `contact.*`, `deal.*`, `pipeline.*`, `stage.*`, `clientsField.*`, `activity.*`, `client.project.*`, `client.document.linked`                                                                                                                    |
| Audit entities     | `client`, `contact`, `deal`, `pipeline`, `stage`, `clientsField`, `activity`                                                                                                                                                                                |
| Cross-domain reads | project options for `link_client_project`; file options for document linking (both move behind internal APIs)                                                                                                                                               |
| Internal endpoints | search / export / delete as above                                                                                                                                                                                                                           |

### Package layout (#157)

| Module                                                       | Exports                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `packages/clients/src/access.ts`                             | `resolveClientAccess` (edit / manage / export ranks)                                                        |
| `packages/clients/src/schemas.ts`                            | Zod inputs for clients, contacts, deals, pipelines, stages, fields, activities, imports, exports and links  |
| `packages/clients/src/types.ts`                              | Client, contact, deal, pipeline, field, document and overview types plus enum values                        |
| `packages/clients/src/dates.ts`                              | `YYYY-MM-DD` day-key helpers used by custom date fields                                                     |
| `packages/clients/src/repository.ts`                         | `ClientsRepository` over the Prisma client; audit rows are injected through `ClientAudit`                   |
| `packages/clients/src/service.ts`                            | `ClientsService` facade over the sub-domain services; notifications are injected through `ClientNotify`     |
| `packages/clients/src/services/*`                            | Overview, companies, contacts, deals, pipelines, fields, documents, links, activities and CSV import/export |
| `packages/clients/src/components/*`                          | Clients/contacts/deals UI, dialogs, timeline, documents, custom fields, pipeline settings and portal access |
| `packages/clients/src/components/actions.tsx`                | `ClientActions` port + `ClientActionsProvider` / `useClientActions()`                                       |
| `packages/clients/src/components/use-clients.ts`             | Formatting, CSV download and `datetime-local` helpers                                                       |
| `apps/clients/lib/clients/index.ts`                               | Adapter: binds the Prisma client, `recordAuditMany`/`withActorIdentity` and the notification inbox          |
| `apps/clients/lib/client-actions.ts`                              | Builds `CLIENT_ACTIONS` from `actions/clients.ts` and exposes it through `ClientActionsProvider`             |


### Routes

| Route                                                      | Kind   | Inventory                                                                            |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `/[locale]/[orgSlug]`                  | Page   | `page.tsx`; redirects to `/clients`                                     |
| `/[locale]/[orgSlug]/(clients)`        | Layout | `(clients)/layout.tsx`; `ClientsTabs` (actions come from the org layout) |
| `/[locale]/[orgSlug]/clients`          | Page   | `clients/page.tsx`; `clientsService.getOverview` → `ClientsPanel`        |
| `/[locale]/[orgSlug]/clients/[id]`     | Page   | `clients/[clientId]/page.tsx`; `getClientDetail` → `ClientDetail`        |
| `/[locale]/[orgSlug]/contacts`         | Page   | `contacts/page.tsx`; `clientsService.getOverview` → `ContactsPanel`      |
| `/[locale]/[orgSlug]/contacts/[id]`    | Page   | `contacts/[contactId]/page.tsx`; `getContactDetail` → `ContactDetail`    |
| `/[locale]/[orgSlug]/deals`            | Page   | `deals/page.tsx`; `clientsService.getOverview` → `DealsWorkspace`        |
| `/[locale]/[orgSlug]/deals/[dealId]`   | Page   | `deals/[dealId]/page.tsx`; `getDealDetail` → `DealDetail`                |
| `/api/auth/*`, `/api/health`           | API    | OIDC relying party (`@workspace/oidc`), organization switch and probe   |
| Tests                                  | Playwright | `e2e/clients.spec.ts` (sign-in, switch, company flow) and `e2e/authorization.spec.ts` (cross-organization read denied) |

Old Copilot `/{locale}/{orgSlug}/clients|contacts|deals` paths 308-redirect to
the clients host (`apps/copilot/proxy.ts`).

**Known gap (#171/#190):** portal access management (invite / revoke / cancel)
still creates Better Auth invitations inside Copilot, so the client detail card
is read-only on the clients host until the identity API exposes invitations.
The list itself (portal members and pending invites) reads the shared database
through `apps/clients/lib/portal-access.ts`.

## Employees

Live at `apps/employees` (`employees.copilot.asynchrone.space`, #163) with
`@workspace/employees`. Renamed from HR by #147 and extracted in #157.

The package owns employee profiles, attendance, leave, balances, adjustments,
settings, salary, capacity, access checks, schemas, services, CSV/date helpers,
types and UI. Salary and payroll stay behind `isAdmin`/`requireAdmin` exactly as
before: the app passes the OIDC session's membership role into the service and
never widens it. The app owns the server actions, the page, the organization
shell, the host-only OIDC session and the audit wiring.

| Surface            | Inventory                                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages              | `/[orgSlug]/employees` (per-route rows below)                                                                                                                                                                   |
| Server actions     | `apps/employees/actions/employees.ts` (attendance, time tracking, payroll, leave, balances, allowances, settings, profiles, salaries, project employee settings, CSV export)                                   |
| MCP tools          | `get_employees_overview`, `list_attendance`, `set_attendance`, `request_leave`, `decide_leave`, `get_time_tracking`                                                                                             |
| Prisma models      | `EmployeeProfile`, `AttendanceEntry`, `LeaveRequest`, `LeaveBalance`, `LeaveAdjustment`, `EmployeeSettings`, `SalaryProfile`, `InternalActivity`, `AuditLog`                                                    |
| Audit actions      | `client.create`, `client.update` (payroll clients), `project.update`, `settings.update`, `salary.update`, `profile.update`, `balance.set`, `balance.adjust`, `attendance.clear`, `leave.create`, `leave.cancel` |
| Audit entities     | `employeeProfile`, `employeeSettings`, `salaryProfile`, `attendance`, `leaveRequest`, `leaveBalance`, `leaveAdjustment`, `internalActivity`                                                                     |
| Cross-domain reads | project names/tasks for time allocation (internal projects API after the split)                                                                                                                                 |
| Internal endpoints | search / export / delete as above                                                                                                                                                                               |

### Package layout (#157)

| Module                                                     | Exports                                                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `packages/employees/src/access.ts`                         | `resolveEmployeeAccess` (admin / validator / track ranks)                                          |
| `packages/employees/src/schemas.ts`                        | Zod inputs for attendance, leave, balances, allowances, settings, profiles, salaries and exports   |
| `packages/employees/src/types.ts`                          | Employee profile, attendance, leave, balance, salary, overview and capacity types plus enum values |
| `packages/employees/src/date-utils.ts`                     | Day/week/month key arithmetic, business days and local-date helpers                                |
| `packages/employees/src/holidays.ts`                       | French public holidays and working-day checks                                                      |
| `packages/employees/src/capacity.ts`                       | Capacity month/week/row/total computation                                                          |
| `packages/employees/src/csv.ts`                            | Re-export of `@workspace/core/csv` (`toCsv`, `formatCsvNumber`)                                    |
| `packages/employees/src/alerts.ts`                         | Dashboard alerts (missing entries, pending leave, low balances)                                    |
| `packages/employees/src/utils.ts`                          | Leave halves, working-day ranges, hours formatting and entry lookup                                |
| `packages/employees/src/repository.ts`                     | `EmployeesRepository` over the Prisma client; audit rows are injected through `EmployeeAudit`      |
| `packages/employees/src/service.ts`                        | `EmployeesService` facade over the sub-domain services                                             |
| `packages/employees/src/services/*`                        | Overview, attendance, leave, settings, payroll, records, fetch and CSV exports                     |
| `packages/employees/src/components/*`                      | Today, calendar, leave, tracking, capacity, payroll, admin and dialog UI                           |
| `packages/employees/src/components/actions.tsx`            | `EmployeeActions` port + `EmployeeActionsProvider` / `useEmployeeActions()`                        |
| `apps/employees/lib/employees/index.ts`                          | Adapter: binds the Prisma client and `recordAuditMany`/`withActorIdentity`                         |
| `apps/employees/lib/employee-actions.ts`                         | Builds `EMPLOYEE_ACTIONS` from `actions/employees.ts` and mounts the provider                      |


### Routes

| Route                                         | Kind    | Inventory                                                                                     |
| --------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `/[locale]/[orgSlug]`              | Page    | `page.tsx`; redirects to `/employees`                                              |
| `/[locale]/[orgSlug]/employees`    | Page    | `employees/page.tsx`; `employeesService.getOverview` → `EmployeesWorkspace`        |
| `/[locale]/[orgSlug]/employees`    | Loading | `employees/loading.tsx`; `GridSkeleton`                                            |
| `/api/auth/*`, `/api/health`       | API     | OIDC relying party (`@workspace/oidc`), organization switch and probe              |
| Tests                              | Playwright | `e2e/employees.spec.ts` (sign-in, switch, owner sees payroll) and `e2e/authorization.spec.ts` (member sees no payroll, cross-organization read denied) |

Old Copilot `/{locale}/{orgSlug}/employees` paths 308-redirect to the employees
host; `/hr` (the pre-#147 name) lands on the employees host's `/employees` screen.

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

Target: stays in `apps/copilot` (#164); there is no `apps/portal`. The domain
package landed in #158: `@workspace/portal` owns the context and authorization
rules, the dashboard/project/task/document read models, document upload and
download, the shared thread and task comments, portal access management and the
meetings read model. Every portal read goes through an internal API call
(`DomainClient`); Copilot no longer imports a domain package.

| Surface        | Inventory                                                                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages          | `/[locale]/portal`, `/[locale]/portal/projects/[projectId]`, `/[locale]/portal/projects/[projectId]/tasks/[taskId]`, `/[locale]/portal/documents`, `/[locale]/portal/meetings` (per-route rows below)                          |
| Server actions | `actions/portal.ts` (invite, revoke, cancel invite, claim access, post message, mark seen, post task comment); `actions/meetings.ts` (portal create/cancel)                                                                   |
| API            | `POST /api/portal/documents/upload`, `GET /api/portal/files/[fileId]/download`                                                                                                                                                |
| Library        | `@workspace/portal` (`context`, `schemas`, `repository`, `service`, `runtime`, `types`, `components/*`); `apps/copilot/lib/portal/index.ts` binds Prisma, storage, files, projects, meetings, Better Auth, audit and notifications |
| Models         | `PortalInvite`, `Member.clientId` (identity); `Client` (clients); `Project`, `Task`, `ProjectMessage`, `TaskComment` (projects); `FileNode` (files)                                                                           |
| Access rules   | per-project client access policy: portal visibility, discussion and task comments each `hidden` / `read` / `read & write`; portal accounts are `role=client` and blocked from the workspace, server actions, file API and MCP |
| Badges         | “new since last visit” state per portal user                                                                                                                                                                                  |
| Audit          | `client.document.linked` is written by the clients app for a portal upload; portal project messages and task comments write `project.message.added` / `task.comment.added` through the projects app. |
| Tests          | `packages/portal/src/service.unit.test.ts` (client scope, cross-org, access management, upload/download), `apps/copilot/e2e/portal.spec.ts` (invitation → portal, project visibility, document upload/download, workspace and portal rejection) and the cross-app deletion/export probes |

### Package layout (#158)

| Module                             | Exports                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/portal/src/types.ts`     | `PortalContext`, dashboard, project, task, document, access and download types                                                                     |
| `packages/portal/src/context.ts`   | `requirePortalContext`, `isPortalContext`, `requirePortalManager`, `requireInternalMember`                                                         |
| `packages/portal/src/schemas.ts`   | Zod inputs for invitations, revocation, claim, project messages and task comments                                                                  |
| `packages/portal/src/deps.ts`      | Ports: storage, files, collaboration (projects thread/comments), meetings, Better Auth invitations, audit and notifications                          |
| `packages/portal/src/repository.ts`| `PortalRepository` over the structural `PortalDb` port                                                                                             |
| `packages/portal/src/service.ts`   | `PortalService`: dashboard, project/task reads, documents, upload/download, seen state, access management and meetings                              |
| `packages/portal/src/runtime.ts`   | `createPortalRuntime` binds db + storage + files + collaboration + meetings + invitations + audit + notifications                                  |
| `packages/portal/src/components/*` | Portal header/nav, seen tracker, upload, discussion, task comments and meetings UI; actions come through `PortalActions`                           |
| `apps/copilot/lib/portal/index.ts`     | Adapter: binds Prisma, `@workspace/storage`, `@workspace/files`, `@workspace/projects`, `@workspace/meetings`, Better Auth, audit and notifications |
| `apps/copilot/lib/portal/context.ts`   | Adapter: resolves `Member.clientId` from Copilot's Better Auth session (`getPortalContext` / `isPortalMember`)                                     |

### Routes

| Route                                                  | Kind   | Inventory                                                                                                                  |
| ------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `/[locale]/portal`                                     | Page   | `portal/page.tsx`; `portalService.getDashboard` → project progress and shared documents                                     |
| `/[locale]/portal/layout`                              | Layout | `portal/layout.tsx`; session + `getPortalContext` guard, appearance provider and `PortalActionsProvider`                   |
| `/[locale]/portal/documents`                           | Page   | `portal/documents/page.tsx`; `portalService.getDocuments` → `PortalUpload`                                                  |
| `/[locale]/portal/meetings`                            | Page   | `portal/meetings/page.tsx`; `portalService.getMeetings` → `PortalMeetings`                                                  |
| `/[locale]/portal/projects/[projectId]`                | Page   | `portal/projects/[projectId]/page.tsx`; `portalService.getProject` + `listMessages` → `PortalDiscussion`                   |
| `/[locale]/portal/projects/[projectId]/tasks/[taskId]` | Page   | `portal/.../tasks/[taskId]/page.tsx`; `portalService.getTaskDetail` → `PortalTaskComments`                                 |
| `POST /api/portal/documents/upload`                    | API    | `app/api/portal/documents/upload/route.ts`; `portalService.uploadDocument` (25 MB cap, quota, client-visible link, audit)   |
| `GET /api/portal/files/[fileId]/download`              | API    | `app/api/portal/files/[fileId]/download/route.ts`; `portalService.openDocument` (client-visible link + large-object stream) |

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
| `GET /audit`                             | each app    | `@workspace/audit` `createAuditListHandler`, `AuditPageSchema`               | `internal:audit:read`          | implemented in every app       |
| `GET /audit/facets`                      | each app    | `@workspace/audit`, `AuditFacetsSchema`                                      | `internal:audit:read`          | implemented in every app       |
| `GET /audit/export`                      | each app    | `@workspace/audit`, `AuditExportSchema`                                      | `internal:audit:read`          | implemented in every app       |
| `POST /audit/prune`                      | each app    | `@workspace/audit`, `AuditPruneRequest/ResultSchema`                         | `internal:audit:write`         | implemented in every app       |
| `POST /notifications`                    | Copilot     | `app/internal/v1/notifications/route.ts`, `NotificationInput/ResultSchema`   | `internal:notifications:write` | implemented                           |
| `POST /auth/revoke`                      | each domain | `app/internal/v1/auth/revoke/route.ts`; deletes local sessions by Copilot `sid` | `internal:domain:write`        | implemented (#169)                    |
| `GET /search`                            | each domain | `@workspace/search` `createSearchHandler`, `SearchResponseSchema`            | `internal:search:read`         | implemented in every domain app |
| `GET /organizations/:id/export`          | each domain | `@workspace/sagas` `createOrganizationExportHandler`, `ExportPartSchema`     | `internal:export:read`         | implemented in every domain app |
| `DELETE /organizations/:id`              | each domain | `@workspace/sagas` `createOrganizationDeletionHandler`, `DeletionResultSchema` | `internal:delete:write`      | implemented in every domain app |
| `DELETE /users/:id`                      | each domain | `@workspace/sagas` `createUserDeletionHandler`, `DeletionResultSchema`       | `internal:delete:write`        | implemented in every domain app |
| Domain CRUD used by assistant/MCP/portal | each domain | `createDomainHandler` + `/internal/v1/domain/:operation`, `DomainCallSchema`   | `internal:domain:read/write`   | implemented (#190)                    |

`packages/contracts/src/internal/contracts.ts` owns `INTERNAL_ROUTES` and the
shared schemas; `packages/contracts/src/clients/*` owns the typed clients. Do
not add an ad-hoc route shape.

## Environment variables

| Variable(s)                                                                                                                                                                                                              | Owner / readers                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `DATABASE_POOL_MAX`                                                                                                                                                                                      | the retired monolith schema, split/migration tooling and scripts; every app reads its own `*_DATABASE_URL` first |
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

| Suite                     | Location                                                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — Copilot shell      | `apps/copilot/lib/{account,admin,audit,auth,billing,email,identity,oauth,organization,search}*.unit.test.ts`                                                                                                                                                       |
| Unit — Projects           | `packages/projects/src/{service,sync}.unit.test.ts` (task authorization, repository sync primitives); e2e and scripts cover the rest                                                                                                                           |
| Unit — Files              | `packages/files/src/{service,upload-session}.unit.test.ts`                                                                                                                                                                                                     |
| Unit — Clients/Employees  | `packages/clients/src/{access,import-export}.unit.test.ts` (role permissions, CSV export); `packages/employees/src/{access,exports}.unit.test.ts` (role/validator permissions, leave and audit exports)                                                        |
| Unit — Messaging          | `packages/messaging/src/service.unit.test.ts` (membership, unread state, threads, attachment upload/download, cross-org authorization)                                                                                                                         |
| Unit — Portal             | `packages/portal/src/service.unit.test.ts` (client-member scope, cross-org reads, access management, document upload/download)                                                                                                                                |
| Unit — Calendars/Meetings | `packages/calendars/src/service.unit.test.ts` (personal calendar creation, membership mapping, attendee response, role/cross-org guards); `packages/meetings/src/service.unit.test.ts` (request rules, conflict flags, notification fan-out, booking, decline); `apps/calendars/lib/auth/routing.unit.test.ts` (token organization, 2FA gate) |
| Unit — shared packages    | `packages/{ai,app-shell,appearance,audit,auth,billing,contracts,core,db-core,integrations,notifications,oidc,organization,sagas,search,service-auth,storage}/**/*.unit.test.ts`                                                                                |
| Unit — Assistant          | `packages/ai/src/{chat,conversations}.unit.test.ts` (stream reducer, deterministic replay, list ordering); `apps/copilot/lib/assistant/history.unit.test.ts`; `apps/copilot/app/api/assistant/{route,conversations/route}.unit.test.ts` (server-owned history, failed stream, create/delete cross-origin) |
| Contracts (DB)            | `apps/copilot/scripts/contracts/assistant-persistence.contract.test.ts` (stored turns, reload, cross-org/cross-user rejection)                                                                                                                                |
| E2E                       | `apps/copilot/e2e/{a11y,assistant,assistant-domain,audit-log,password-reset,portal}.spec.ts`; `apps/projects/e2e/{projects,authorization}.spec.ts` (#160); `apps/calendars/e2e/calendars.spec.ts` (#161); `apps/files/e2e/{files,upload}.spec.ts` (#161); `apps/messages/e2e/messages.spec.ts` (#162); `apps/clients/e2e/{clients,authorization}.spec.ts` and `apps/employees/e2e/{employees,authorization}.spec.ts` (#163) |
| Cross-app E2E             | `packages/e2e` (`npm run test:e2e --workspace=@workspace/e2e`): Copilot + projects + calendars on separate hosts — sign-in, token refresh, organization-switch revocation, back-channel logout, impersonation handoff/banner/one-hour TTL, audience binding, stale session, partial search/audit/export and the deletion-saga retry (#210); see `docs/cross-app-e2e.md` |
| Verification scripts (DB) | `apps/copilot/scripts/verify-trial.ts` (identity only). The former domain verification scripts were retired with the monolith binding; their coverage now lives in the per-app Playwright suites and the cross-app suite. |
| Legal copy                | `npm run verify:legal-copy --workspace=landing`                                                                                                                                                                                                                    |
| Control tower             | `apps/control-tower/scripts/verify-{auth-config,platform-authorization}.ts`                                                                                                                                                                                    |
| Boundaries                | `scripts/check-boundaries.mjs`                                                                                                                                                                                                                                 |
| Prisma/migrations         | `scripts/{verify-prisma-schemas,verify-migrations}.mjs`                                                                                                                                                                                                        |

Run every workspace unit test with `npm run test:unit` (Turbo). Add a unit test next to a non-trivial extraction; #159 and #210 add the cross-domain and end-to-end coverage.

## Parity checklist

Every app owns its database, its internal endpoints and its tests. The
checklist below was re-run on 2026-11-02 against the live per-app databases,
the per-app Playwright suites and the cross-app suite (#171).

### Landing (#176, #167)

- [x] Marketing routes render from `apps/landing` with no session or database.
- [x] MDX content, legal copy/PDFs and locale mirroring are unchanged.
- [x] No `@workspace/db-*`, auth or API route is imported (`verify:stateless`).
- [x] Links to Copilot use `NEXT_PUBLIC_WORKSPACE_URL`.

### Copilot (#149, #150, #151, #152, #175, #164, #165, #166, #190)

- [x] Renamed from `apps/web` to `apps/copilot`, deployed from the
      `asynchrone-space-copilot` image and a generic Helm chart instance at
      `copilot.asynchrone.space` (#175, #168).
- [x] Auth, 2FA, onboarding, organization selection, settings, billing, audit,
      search, help, feedback, MCP, platform handoff and the assistant run here.
- [x] OIDC authorization server, JWKS, consent and token lifecycle are unchanged.
- [x] The client portal stays here: `/{locale}/portal` pages, `/api/portal/*`,
      the client invitation flow, document upload/download, project visibility
      and the workspace/portal redirects, with Playwright coverage (#164).
- [x] The portal reads domain data through internal APIs instead of the
      in-process packages (#190, #171).
- [x] Conversations persist and the server owns model history (#165).
- [x] Copilot is the organization home: `/{locale}/{orgSlug}` renders the
      server-loaded conversation list, new chat, streaming transcript and tool
      cards with create/reopen/delete, and no separate shell redirect is needed
      (#166).
- [x] No domain Prisma import remains in the assistant, MCP tools or portal
      adapter (#190).
- [x] Copilot reads identity rows from `asynchrone_identity`; the monolith
      `@workspace/db` is only used by the migration/split tooling.

### Projects (#153, #160)

- [x] Repository, service, schemas, types, project/task UI and repository sync
      live in `@workspace/projects`; app adapters bind db, auth, audit,
      notifications and env (#153).
- [x] Pages and actions live in `apps/projects`; Copilot redirects the old paths
      and no longer loads project data in its shell (#160).
- [x] Host-only OIDC session, 2FA page gate and organization switch on the
      projects host (#160).
- [x] Own image (`APP=projects`), generic Helm chart instance, compose service and CI jobs
      (#160).
- [x] Audit rows are written by the projects app (`apps/projects/lib/audit.ts`)
      into its own `auditLog` table; Copilot aggregates them.
- [x] Projects/tasks/messages/repository models are read from
      `asynchrone_projects` (`@workspace/db-projects`).
- [x] The hourly `repository-sync` cron moved to `apps/projects`
      (`/api/cron/repository-sync`, `CRON_SECRET`) (#168).
- [x] MCP tools stay in Copilot and call the projects internal API; the
      repository webhook moved to `apps/projects`
      (`/api/webhooks/repositories/:id`).
- [x] Search, export and deletion endpoints are mounted
      (`/internal/v1/search`, `/internal/v1/organizations/:id/export`,
      `DELETE /internal/v1/organizations/:id`, `DELETE /internal/v1/users/:id`).
- [x] Assistant, MCP and portal reach it through `DomainClient` and
      `/internal/v1/domain/:operation` (#190).
- [x] Identity reads (`member`, `user`, `account`) go through
      `IdentityClient`; the project member list and personal repository tokens
      are served by the identity API.

### Calendars (#154, #161)

- [x] Calendar and meeting screens, actions and the meeting inbox/settings live
      in `apps/calendars`; Copilot 308-redirects the old paths (#161).
- [x] Host-only OIDC session, 2FA page gate, organization switch, own image
      (`APP=calendars`), chart, compose service and CI jobs (#161).
- [x] Calendar/event/meeting models live in `asynchrone_calendars`.
- [x] MCP tools and the assistant use the calendars internal API (#190).
- [x] Search, export and deletion endpoints are mounted.
- [x] Meeting scheduling reads members through the identity API and the
      calendar task overlay through the projects internal API; no other app's
      database is reachable.

### Files (#155, #161)

- [x] File screens/actions, resumable upload API, download endpoint and the
      `uploads-sweep` cron live in `apps/files` (#161).
- [x] Host-only OIDC session, own image (`APP=files`), chart with the
      uploads-sweep CronJob, compose service and CI jobs (#161).
- [x] Large objects, versions, shares and activity live in `asynchrone_files`.
- [x] Portal uploads stream into the files app and downloads stream back out
      through the internal API; the client-visible link is still enforced.
- [x] Export and deletion unlink every large object in `asynchrone_files`.
- [x] Search endpoint is mounted, plus internal export/delete and content
      streaming for the archive.

### Messages (#156, #162)

- [x] Messages app at `messages.copilot.asynchrone.space` with its own image, chart, OIDC session and Playwright suite (`#162`).
- [x] Conversations, threads, reactions and attachments moved; Copilot 308-redirects the old paths.
- [x] Attachment upload/download keeps the chunked-session and large-object
      semantics; the upload sessions and bytes live in `asynchrone_messages`.
- [x] Conversations/messages/reactions/attachments live in `asynchrone_messages`.
- [x] Portal discussion is the project-scoped thread served by the projects
      internal API (`list-project-messages` / `create-project-message`); the
      portal never imports the projects package.
- [x] Search, export and deletion endpoints are mounted; deletion unlinks the
      attachment bytes.

### Clients (#157, #163)

- [x] `#147` rename has landed and no `crm*` identifier remains in the package.
- [x] Clients/contacts/deals/pipelines/fields/activities pages, actions and MCP tools.
- [x] `@workspace/clients` owns the repository, service, schemas, access checks, CSV/date helpers, types and UI (`#157`).
- [x] Models live in `asynchrone_clients`; document links reference files by id
      and read metadata through the files internal API.
- [x] Project linking uses the projects internal API
      (`set-project-client`, `list-client-projects`, counters).
- [x] Audit, search, export and deletion endpoints are mounted.
- [x] Portal access reads the identity API; invitations/revocations stay in
      Copilot.

### Employees (#157, #163)

- [x] `#147` rename has landed and no `hr*` identifier remains in the package.
- [x] Attendance, leave, capacity, payroll, settings, profile and CSV export.
- [x] `@workspace/employees` owns the repository, service, schemas, access checks, CSV/date helpers, types and UI; salary stays behind `isAdmin` (`#157`).
- [x] Models live in `asynchrone_employees`.
- [x] Project allocation and the payroll client list use the projects and
      clients internal APIs.
- [x] Audit, search, export and deletion endpoints are mounted.

### Control tower (#209, #210)

- [x] Signs in with only `asynchrone_control_tower`.
- [x] Platform audit rows live there; handoff rows are created by Copilot and
      copied for schema parity (ADR 0034).
- [x] Customer identity reads and mutations go through `IdentityAdminClient`.
- [x] No control-tower code imports the identity database.
- [x] `verify:auth-config` and `verify:platform-authorization` pass.

## Known coupling

None. Every customer app imports exactly one `@workspace/db-*` package, and the
domain packages read identity and other domains through the versioned internal
APIs. `@workspace/db` remains only as the retired monolith schema used by the
one-off data-split tooling; no app or package runtime imports it.

The #147 rename is complete: the route group is `(clients)`, the packages are
`@workspace/clients` and `@workspace/employees`, the tables are
`clientActivity`, `clientFieldDefinition`, `clientDocument`,
`employeeProfile` and `employeeSettings`, and the MCP tools use `clients_*` /
`employees_*`.

## How to update this document

- Moving a page, action, route, tool or model: update its row in the same PR.
- Adding a surface: add it to exactly one app, plus its audit and test rows.
- Adding an internal endpoint: add it to `INTERNAL_ROUTES`, a Zod contract and
  the internal API map before wiring the handler.
- Removing a coupling: delete the row from “Known coupling”.

### Deployment (#168)

- [x] The Docker matrix publishes one image per app (landing, copilot, projects,
      calendars, files, messages, clients, employees, control-tower) plus the
      migrate image, all from the same Dockerfile (`APP=…`).
- [x] One generic Helm chart (`charts/asynchrone-space-app`) is instantiated per
      app through umbrella dependency aliases; the umbrella keeps the migrate
      hook and wildcard Certificates.
- [x] DNS/TLS: `asynchrone.space` + `*.asynchrone.space` for landing, Copilot,
      the control tower and `www` (redirected to the apex);
      `*.copilot.asynchrone.space` for the domain apps.
- [x] Per-app Secrets carry the database URL and OAuth client pair; the
      internal audience is derived by `@workspace/contracts`.
- [x] `BETTER_AUTH_URL` and `MCP_RESOURCE_URL` point at Copilot,
      `PLATFORM_APP_URL` on the control tower points at Copilot, and there is no
      shared cookie.
- [x] Cron ownership: copilot (four identity jobs), projects
      (`repository-sync`), files (`uploads-sweep`); every cron has exactly one
      owner.
- [x] `docker compose up --build` starts all nine apps on ports 3001–3009.
- [x] `npm run verify:helm` lints and renders the umbrella, each app alias and
      the generic chart standalone.

### Cross-app coverage (#210)

- [x] One Playwright suite (`packages/e2e`) drives Copilot plus two relying
      parties on separate hosts: sign-in, access-token refresh, organization
      switch (with cross-app revocation) and logout with back-channel logout.
- [x] Impersonation: control-tower handoff call → single-use grant → Copilot
      session with `impersonatedBy` → banner on Copilot and projects → the
      one-hour gate on both → stop-impersonating fan-out.
- [x] Failure injection: a configured-but-down app yields `partial` search and
      audit results (page and export), a typed retryable delegated error, a
      resolving switch fan-out and a deletion-saga retry that deletes identity
      last; the shell keeps rendering.
- [x] Audience binding: a projects service token is rejected by calendars (and
      vice versa); the admin API requires the control-tower client.
- [x] The `e2e-cross-app` CI job runs the suite on ports 3020–3022 against the
      migrated per-app databases.
- [x] The domain apps mount `/internal/v1/{audit,search,organizations/:id}`
      and the audit/search/export fan-outs use them. The deletion-retry probe
      keeps a controllable local origin only to simulate an outage and recovery
      (see [cross-app-e2e.md](../cross-app-e2e.md#gaps)).
