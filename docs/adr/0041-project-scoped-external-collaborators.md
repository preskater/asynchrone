# 0041. Project-scoped external collaborators

- Status: accepted
- Date: 2026-11-12
- Deciders: Asynchrone Space maintainers
- Related: [ADR 0040](0040-cumulative-organization-roles-and-capabilities.md), issue #135

## Context

Agencies, partners and freelancers need to work on **one project** of another
organization: follow tasks, comment, talk in the project thread. The only
options were a full membership (every project, the CRM, HR and files, plus a
seat) or the client portal (one client company, read-only by policy).

The tenant boundary is `organizationId`, and every workspace gate assumes a
`member` row: the domain apps' `requireWorkspace()`, Copilot's
`getRequestContext()`, the OAuth claims, search, recents and notifications.
Bending those gates so that a non-member can hold a session on the host's
organization would turn a project grant into a second boundary that every
existing query would have to honour.

## Decision

- **A grant, never a membership.** `projectGuest` (identity database) holds
  one person's access to one project: host organization, project id and a
  name snapshot, invited email, the accepting `userId`, `invited | active |
revoked`, comma-separated guest capabilities, the SHA-256 of the invitation
  link token, `expiresAt`, and the inviter. No `member` row is created, so
  guests take no seat and every existing workspace gate keeps refusing them by
  construction.
- **A separate guest space in Copilot**, like the portal: `/guest` (projects
  shared with me), `/guest/accept?token=…` and `/guest/{grantId}[/tasks/{id}]`.
  Guests never get a domain-app session or a token for the host organization;
  the workspace switcher, onboarding and every `/{orgSlug}` route are
  untouched.
- **Resolved on every request.** `guestService.resolve(user, grantId)` reads
  the grant and returns a context only when it is `active`, belongs to the
  signed-in user, has not expired and the host plan still includes guests.
  Revocation, expiry and a plan downgrade therefore all end access on the next
  request; an expired grant behaves exactly like a revoked one.
- **Project scope enforced where the data lives.** Copilot calls the projects
  app with a delegated context carrying `guest: { grantId, projectId,
capabilities }` and a role that grants nothing (`client`). The projects app
  serves only `guest-*` operations to it, takes the project from the context
  (never from the input) and looks every task up through that project, so any
  other id is a 404. The shared domain handler (`@workspace/service-auth`)
  rejects a guest context on a non-guest operation, and a member context on a
  guest operation, in every domain app.
- **Own capability vocabulary**, narrower than members': `project:read`,
  `task:read` (always), `task:comment` (default), `task:write` (status
  changes), `message:read`, `message:write`. Workspace capabilities are
  dropped when parsing, so a grant can never carry `member:*`, `billing:*`,
  `crm:*`, `hr:*` or `organization:*`.
- **Plan gate.** `externalCollaborators` in `@workspace/core/plans` is the
  number of open grants per project: 0 on Free, 5 on Team, unlimited on
  Enterprise.
- **Audit in the host organization**: `project.guest.invited`, `.accepted`
  (with the guest's own organizations), `.revoked` and `.left`. Comments and
  thread messages keep `authorKind: "guest"` and an author name snapshot, and
  render with an "External" badge for the team.

## Consequences

- No existing query had to learn a project scope: the second boundary only
  exists in the `guest-*` operations, which are small and tested on their own
  (`apps/copilot/scripts/contracts/guests.contract.test.ts` replays the guest
  matrix; `packages/service-auth/src/domain.unit.test.ts` pins the handler
  guard).
- Guests use a simpler UI than members (task list, task detail, comments,
  status, thread), not the project board.
- Deferred: shared project files, assigning tasks to guests (so there is
  nothing to hand back on revocation yet), the 30-day expiry email, a custom
  expiry date, guest notifications, managing guests from the projects app's
  project settings, and organization partnerships.
