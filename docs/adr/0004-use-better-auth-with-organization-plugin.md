# Use Better Auth with the organization plugin for multi-tenant RBAC

- Status: accepted; role model superseded by [ADR 0040](0040-cumulative-organization-roles-and-capabilities.md)
- Deciders: Asynchrone Space maintainers
- Date: 2026-10-10

## Context and Problem Statement

Asynchrone Space is multi-tenant: every calendar, project, file, and message belongs to an
organization, and users have a role within each organization. The app also needs
email/password authentication and an admin surface. How should authentication,
organization membership, and role-based access control be implemented without
building and maintaining a bespoke auth system?

## Decision Drivers

- Authentication must integrate directly with the Prisma/Postgres data layer.
- Organization membership, invitations, teams, and roles are core product
  concepts, not an afterthought.
- Role checks must be enforceable both in server code and in the UI.
- Next.js cookies/session handling should work with minimal glue.

## Considered Options

- Better Auth with the `organization`, `admin`, and `nextCookies` plugins.
- NextAuth/Auth.js with a custom organization layer.
- A hand-rolled session and RBAC implementation.

## Decision Outcome

Chosen option: "Better Auth with the `organization`, `admin`, and `nextCookies`
plugins", because it provides sessions, organizations, invitations, teams, and
access control out of the box, backed by Prisma.

`lib/auth.ts` wires `betterAuth` to `prismaAdapter(prisma, { provider:
"postgresql" })`, enables email/password, and registers the organization plugin
(teams enabled, roles from `ac`/`orgRoles`, organization and membership limits)
plus `admin()` and `nextCookies()`. An `afterCreateOrganization` hook seeds a
default "Personal" calendar. Roles (`owner`, `admin`, `member`, `viewer`) are
declared in `lib/organization/access.ts` via `createAccessControl`.

### Positive Consequences

- Organization, invitation, team, and role lifecycles are handled by the
  library; the app defines policy, not mechanics.
- Session cookies integrate with Next.js through `nextCookies()`.
- Role definitions are declarative and reused by server checks and the
  `use-permissions` hook.

### Negative Consequences

- The auth schema is owned by the library, so schema changes come from Better
  Auth migrations/plugins.
- Role semantics beyond the plugin's statements (e.g. file-write rank) still
  require application code such as the `ROLE_RANK` map in the upload flow.
- Upgrading Better Auth can require coordinated auth-table migrations.

## Pros and Cons of the Options

### Better Auth with organization/admin plugins

- Good, because multi-tenancy and RBAC are first-class and Prisma-backed.
- Good, because it integrates cleanly with Next.js cookies.
- Bad, because the schema and APIs are library-owned.

### NextAuth/Auth.js with a custom organization layer

- Good, because it is a widely used, flexible authentication library.
- Bad, because organizations, invitations, teams, and roles must be built and
  maintained by hand.

### Hand-rolled sessions and RBAC

- Good, because it gives complete control over the implementation.
- Bad, because security-critical session handling is easy to get wrong and
  costly to maintain.

## Links

- `apps/web/lib/auth.ts`
- `apps/web/lib/auth-client.ts`
- `apps/web/lib/organization/access.ts`
- `apps/web/lib/organization/roles.ts`
- `apps/web/app/api/auth/**`
