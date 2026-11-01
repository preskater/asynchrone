# Per-app databases

ADR 0032 gives every workspace app its own PostgreSQL database. The target
schemas are generated from the monolith schema by
`scripts/split-prisma-schema.mjs`; the data copy is #185 and the migration
orchestration is #184.

## Packages

| Database                   | Package                       | Owner                                                                                                                    |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `asynchrone_identity`      | `@workspace/db-identity`      | Copilot: users, sessions, organizations, members, OAuth, billing, notifications, assistant, portal, rate limits, exports, the projects/calendars/files OIDC sessions until #190 |
| `asynchrone_projects`      | `@workspace/db-projects`      | Projects, tasks, templates, comments, activity, repository sync, its own `oidcSession`                                   |
| `asynchrone_calendars`     | `@workspace/db-calendars`     | Calendars, events, meeting requests/settings, its own `oidcSession`                                                      |
| `asynchrone_files`         | `@workspace/db-files`         | File nodes, versions, shares, upload sessions, its own `oidcSession`; large objects live in the database that holds the metadata |
| `asynchrone_messages`      | `@workspace/db-messages`      | Conversations, messages, reactions, attachment metadata, its own `oidcSession`                                            |
| `asynchrone_clients`       | `@workspace/db-clients`       | Clients, contacts, pipelines, deals, activities, documents                                                               |
| `asynchrone_employees`     | `@workspace/db-employees`     | Employees profiles, attendance, leave, settings, salary, internal activities                                             |
| `asynchrone_control_tower` | `@workspace/db-control-tower` | Platform auth/2FA, platform audit, handoff copy (see [control-tower-database.md](./control-tower-database.md))            |

`@workspace/db-core` owns the shared pool factory and `DATABASE_POOL_MAX`
validation. `@workspace/db` remains the monolith database until #185, and the
projects, calendars, files and messages apps bind it until #190/#171 (their
domain packages still read identity tables and other apps' rows).

Every package declares its own `DATABASE_URL` env:

- `IDENTITY_DATABASE_URL`
- `PROJECTS_DATABASE_URL`
- `CALENDARS_DATABASE_URL`
- `FILES_DATABASE_URL`
- `MESSAGES_DATABASE_URL`
- `CLIENTS_DATABASE_URL`
- `EMPLOYEES_DATABASE_URL`
- `CONTROL_TOWER_DATABASE_URL`

All fall back to `DATABASE_URL` for local/CI convenience. Production sets each
explicitly (#192).

## Local development

`docker/postgres/init.sql` creates every database when the compose volume is
initialized:

```bash
docker compose up postgres
```

Existing volumes are not re-initialized. Create missing databases manually with
the same `CREATE DATABASE` statements or reset the volume.

## Generation

The schemas are generated, not hand-edited:

```bash
npm run split:prisma
npm run verify:prisma-schemas
```

`split-prisma-schema.mjs`:

1. reads `packages/db/prisma/schema.prisma`;
2. assigns every model to one database (auth models are duplicated for the
   control tower);
3. removes relation fields that point at another database, keeping the scalar
   `organizationId`/`userId` columns;
4. appends the shared `AuditLog` table to every database;
5. writes each package's `prisma/schema.prisma`, `prisma.config.ts`, client and
   package scaffold.

Change the ownership map or the source model, then regenerate. Do not edit a
generated schema by hand.

## Generate clients

```bash
npm run generate --workspace=@workspace/db-projects
# or through the Turbo graph:
npm run typecheck
```

Each package writes its client to `lib/generated/prisma`. The generated folders
are ignored by ESLint and git.

## Migrations

The monolith migrations still run first until #185. The per-app orchestrator then
applies every database in dependency order:

```bash
npm run db:create            # creates app + shadow databases when missing
npm run migrate:deploy       # identity → projects → … → control-tower
npm run migrate:status       # per-app Prisma status
npm run verify:migrations    # fails on drift between migrations and schema
```

`packages/migrate` owns the order and the env mapping. It requires every
`*_DATABASE_URL` in production; `--allow-database-url-fallback` exists only for
local/CI where every target lives on one server.

Shadow databases are derived by appending `_shadow` to the database name, or
set explicitly with `IDENTITY_SHADOW_DATABASE_URL`, … They are used by
`verify:migrations` and are created by `db:create`.

The shared `OidcSession` model (an app's relying-party session, see
[oidc-client.md](./oidc-client.md)) ships in the identity, projects, calendars,
files and messages databases: every app needs one row per local sign-in.
`apps/calendars` and `apps/files` got the table in
`20261101130000_add_oidc_session` (#161), `apps/messages` in
`20261101130000_add_oidc_session` (#162). The remaining domain schemas (clients,
employees) add `OidcSession` to their model list and their migration history
when their app is created (#163–#164).

Each database has a `20261031120000_init` baseline; projects, calendars, files
and messages add an `add_oidc_session` migration. The Docker `migrate` stage runs
the monolith migration and then the orchestrator. The Helm migrate Job reads
every `*_DATABASE_URL` from the existing migrate secret.

## Boundaries

- A domain package imports only its own `@workspace/db-<domain>` package.
- No cross-database relation fields or joins. Cross-domain reads use the
  internal APIs from `@workspace/contracts` and `@workspace/service-auth`.
- No cross-database cascades. Organization/user deletion and export are sagas
  (#188).
- Every database has its own migration history; the monolith history is retired
  when #185 cuts the data over.

## Status

- [x] Per-app packages, schemas and clients (#183)
- [x] Local database creation (#183)
- [x] CI schema validation (#183)
- [x] Migration orchestration, baselines, shadow DBs and drift check (#184)
- [x] Maintenance-window data split tooling and runbook (#185)
- [x] Control-tower cutover: own database, platform audit and runbook (#209)
- [ ] App wiring to the per-app clients (#186+); projects (#160), calendars and
      files (#161) and messages (#162) bind the shared client until #190/#171
