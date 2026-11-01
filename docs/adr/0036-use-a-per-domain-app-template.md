# 0036 — Use a per-domain app template for the workspace split

## Status

Accepted (2026-11-01)

## Context

[ADR 0028](0028-split-workspace-into-domain-apps.md) splits the workspace into a
stateless landing, a Copilot shell and one app per domain.
[ADR 0029](0029-use-copilot-as-oauth-authorization-server.md) makes Copilot the
only authorization server, `@workspace/oidc` the shared relying party and every
other app a host-only-session client. [ADR 0032](0032-give-each-app-its-own-database.md)
gives every app its own database.

The remaining apps (calendars, files, messages, clients, employees) will repeat
the same pieces: locale-prefixed `/{locale}/{orgSlug}` routes, the shared shell,
an OIDC session in the app's own database, the 2FA page gate, the organization
switch and its own image, chart and CI jobs. Re-deciding those per app would
drift, and every drift is an authorization bug.

The projects domain is also the first one to move, and its package still reads
identity tables (`member`, `user`, `account`) because member management and
personal repository tokens have not moved behind an internal API yet.

## Decision

Use `apps/projects` (#160) as the template and document it in
[`docs/domain-app-template.md`](../domain-app-template.md).

1. **Shape.** Each app serves `/{locale}/{orgSlug}/<domain>` on its own host and
   redirects `/{locale}/{orgSlug}` to its default screen, so moving a surface
   only changes the host.
2. **Session.** Each app stores its `OidcSession` rows in its own database
   through the new `PrismaOidcSessionStore` helper in `@workspace/oidc`. The
   helper takes the app's `oidcSession` delegate, so the package stays free of
   any database package.
3. **Issuer claim.** Token verification expects `${origin}/api/auth`, the value
   Better Auth publishes as `issuer`; `OidcIssuer()` centralizes it.
4. **Workspace gates.** `requireWorkspace()` composes the shared resolver with
   three fixed rules: a live Copilot session, a token bound to the route's
   organization, and the organization's 2FA policy.
5. **Organization switch.** A domain app never changes its own token's
   organization: it hands off to Copilot's `select-organization` page and
   re-authorizes. Copilot only redirects back to a registered customer origin's
   sign-in route.
6. **Databases.** A domain app imports exactly one database package. The
   projects pilot binds the shared client (`@workspace/db`) until #190 because
   the domain package still reads identity tables; this is recorded as a
   transitional gap, not as a pattern for the next apps.
7. **Redirects.** Copilot's proxy 308-redirects the moved paths to the new host;
   the new app redirects routes it does not own back to Copilot.

## Consequences

- The next app copies a checklist instead of making architectural choices, and
  CI keeps every app buildable, lintable, typechecked, unit-tested, e2e-tested
  and deployable from its own image and chart.
- Until #190 the projects app runs against the shared database. It is the only
  app with this exception; it is called out in the architecture document and in
  the app's `lib/prisma.ts`.
- The `oidcSession` model now exists in the identity and projects databases. The
  other domain schemas add it (with a migration) when their app is created, per
  the rollout note in `docs/databases.md`.
- Two places can serve workspace paths until every domain has moved: the old app
  redirects, the new app renders. There is never a second renderer.
