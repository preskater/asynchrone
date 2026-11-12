# 0040. Cumulative organization roles and capability-based authorization

- Status: accepted
- Date: 2026-11-12
- Deciders: Asynchrone Space maintainers
- Supersedes: the role model of [ADR 0004](0004-use-better-auth-with-organization-plugin.md)

## Context

`member.role` was read as one role on a ladder (`owner 4 > admin 3 > member 2 >
viewer 1 > client 0`), and every check was a rank comparison. A developer who
must connect the repository is not an administrator, but the only way to give
them that access was `admin`, which also handed them member management, billing
and appearance. Teams promoted everyone to admin.

Better Auth already stores a member's roles comma-separated (`"member,developer"`),
accepts an array on invitation and role update, unions permissions across roles
and refuses to demote or remove the last `owner`. Our code threw that away: the
session, the OAuth claims and the identity API all kept `parseRoles(role)[0]`.

## Decision

- **Storage stays `member.role` / `invitation.role`** as Better Auth's
  comma-separated list. No join table: it would be a second source of truth the
  organization plugin never reads, and existing single-role rows are already
  valid sets, so there is no migration.
- **Capabilities, not ranks.** `@workspace/core/roles` maps each role to the
  capabilities it grants (`project:write`, `integration:manage`,
  `billing:manage`, …). A member's capabilities are the union of their roles;
  there is no inheritance. Code asks `can(ctx, capability)`.
  `RequestContext.role` became `roles`.
- **New `developer` role:** `workspace:read`, `integration:manage`,
  `task:write`, `file:write`. Not `member:manage`, `billing:manage`,
  `appearance:update` or any `organization:*`.
- **Rules on a role set** (`roleSetProblem`), enforced in Better Auth's
  `beforeCreateInvitation` / `beforeAddMember` / `beforeUpdateMemberRole` hooks
  and in the identity API: `client` is exclusive, and more than one role needs
  the `granularPermissions` entitlement (Team and up). Free workspaces keep one
  role per member.
- **Wire compatibility:** internal payloads keep `role` (the primary role) and
  add `roles`. Readers use `rolesFrom()`, which falls back to `role`, so a
  rolling deploy never sees a peer it cannot read. Drop `role` once every app
  reads `roles`.
- A role change revokes the member's sessions and OAuth tokens (unchanged), so
  removing a role takes effect on the next request. The audit row records the
  previous and the new set.

## Consequences

- The capability table in `packages/core/src/roles.unit.test.ts` replays the
  old ladder for owner/admin/member/viewer/client and fails if any capability
  differs, and it fails if `ROLE_RANK`/`roleRank` reappear.
- The projects app's member list still edits one role; a member holding several
  is edited in Copilot's members table.
- Organization-defined custom roles fit later: Better Auth's dynamic access
  control can add roles, and `ROLE_CAPABILITIES` is the one table to extend.
- Platform roles in `user.role` (control tower, ADR 0018) are unchanged and are
  not parsed by `parseRoles`, which only knows organization roles.
