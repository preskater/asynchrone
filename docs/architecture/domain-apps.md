# Domain apps: ownership and boundaries

This document is the working contract for the split described in ADRs
[0028](../adr/0028-split-workspace-into-domain-apps.md),
[0029](../adr/0029-use-copilot-as-oauth-authorization-server.md),
[0032](../adr/0032-give-each-app-its-own-database.md) and
[0033](../adr/0033-keep-audit-export-and-deletion-consistent-across-databases.md).
It is owned by the foundation milestone (#2) and expanded by the feature
inventory in [#146](./feature-inventory.md).

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

The registry lives in `@workspace/contracts`:

- `apps.ts` — keys, hosts, development ports, database names, audiences and
  OAuth client environment names; safe to import anywhere.
- `server.ts` — `appOrigin`, `appUrl`, `trustedCustomerOrigins` and
  `workspaceOrigin`; server-only because they read runtime environment.

Hosts, database URLs and OAuth secrets are environment variables. They are never
baked into an image or committed.

## Ownership rules

1. A workspace owns its database and its Prisma client. A domain may only import
   its own `@workspace/db-<domain>` package.
2. A package never imports an app. An app never imports another app.
3. Relative imports never escape their workspace.
4. Every `@workspace/*` import is declared in the importer's `package.json`.
5. Cross-domain reads and writes go through a versioned `/internal/v1/*`
   endpoint; no cross-database joins and no shared Prisma client.
6. The landing has no database and no session. The control tower has its own
   platform auth and reads customer identity through the Copilot admin API.

`npm run check:boundaries` enforces rules 1–4 in CI. The checker scans source
files, including dynamic imports and client components, so a string import is
caught as well.

## Service scope matrix

The service-token claim carries an audience (the target app) and a scope set,
issued by Copilot and verified by `@workspace/service-auth`. The matrix below is
the intended caller/target relationship; the app must still enforce its own
organization, role and row-level rules.

| Caller                                 | Target                                                               | Scopes                                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `copilot`                              | `projects`, `calendars`, `files`, `messages`, `clients`, `employees` | `internal:domain:read`, `internal:domain:write`, `internal:audit:read`, `internal:search:read`, `internal:export:read`, `internal:delete:write` |
| `projects` (and the other domain apps) | `copilot`                                                            | `internal:identity:read`, `internal:notifications:write`                                                                                        |
| `copilot`                              | `control-tower`                                                      | `internal:identity:read`                                                                                                                        |
| `control-tower`                        | `copilot`                                                            | `internal:identity:read`, `internal:identity:admin`                                                                                             |

`@workspace/contracts` exports the stable scope strings (`SERVICE_SCOPES`) so a
caller and handler cannot drift. Audience is always the target app's
`urn:asynchrone:app:<key>`.

## Internal API contract

`@workspace/contracts` defines:

- `INTERNAL_BASE_PATH` (`/internal/v1`) and `INTERNAL_ROUTES`;
- Zod schemas for members, organizations, entitlements, audit events and pages,
  search results, notifications, export manifests, deletion results and
  service-token claims;
- `SERVICE_SCOPES` and the service-token helpers;
- `internalEnvelope(schema)` for the standard success response.

The surface-by-surface inventory, internal endpoint map and parity checklist
live in [feature-inventory.md](./feature-inventory.md).

Internal calls use OAuth `client_credentials` tokens with the target app's
audience and an explicit scope. `/internal/*` is never exposed through public
ingress; Kubernetes `NetworkPolicy` or the compose network restricts callers.
The verifier and token cache live in `@workspace/service-auth` (#181).

## Identity and cross-domain data

- Copilot owns users, organizations, members, roles and entitlements.
- Domain apps store `organizationId` and `userId` as opaque strings and fetch
  display data through the identity internal API (#186).
- Audit rows are written in the app's own database and aggregated by Copilot
  (#187).
- Export and deletion are orchestrated sagas in Copilot (#188); see
  [Cross-database export and deletion](../domain-app-sagas.md).
- Search and notifications use their own internal contracts; see
  [Search, notifications and recents](../search-and-notifications.md).
- The assistant, MCP and portal call domain internal APIs; they do not import a
  domain's Prisma client (#190). That wiring lands with the domain apps in
  milestone #1; the foundation already ships the contracts, tokens and
  failure-mode tests.
- Cross-domain services are port-parameterized packages (#152): storage,
  notifications, integrations, AI, appearance, billing and audit. The owning
  app binds the pool, database client, provider or notifier in a thin adapter
  (`apps/web/lib/*`); the package never opens a second app's database.

## Validation

```bash
npm run check:boundaries
npm run test:unit --workspace=@workspace/contracts
npm run typecheck
npm run lint
```

The boundary checker is intentionally independent of TypeScript resolution: it
also catches imports in files that are not currently reachable from a route.

## Status

- [x] App/database/audience registry (#178)
- [x] Internal API contract package (#178)
- [x] Boundary checker and CI step (#178)
- [x] OAuth authorization server (#179)
- [x] OIDC client package (#180)
- [x] Service-token verifier and cache (#181)
- [x] First-party OAuth clients (#182)
- [x] Per-app database packages and migrations (#183, #184)
- [x] Maintenance-window data split (#185)
- [x] Identity internal API (#186)
- [x] Per-app audit rows and aggregation (#187)
- [x] Export/deletion sagas (#188)
- [x] Notification, search and recents contracts (#189)
- [x] Control-tower identity admin API (#191)
- [x] Network policy and database operations (#192)
- [x] Feature inventory and parity checklist (#146)
- [x] Clients/Employees rename (#147)
- [x] Shared kernel: core, i18n and next-config (#148)
- [x] Auth package and session helpers (#149)
- [x] Organization roles, entitlements, shell and directory (#150)
- [x] App shell and lazy domain hydration (#151)
- [x] Cross-domain services: storage, notifications, integrations, AI, appearance, billing and audit (#152)
- [ ] Assistant/MCP/portal domain wiring and control-tower DB cutover (#190, milestone #1)
