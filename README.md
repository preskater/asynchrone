# Asynchrone Space

[![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](./LICENSE)

**AI‑Native Productivity Platform**

Asynchrone Space is an AI‑first workspace that automates your workflow, centralizes your tasks, and connects your team in one place. It combines calendars, projects, files, and messaging with built‑in AI assistants to help you move faster and stay aligned.

## What you can do with Asynchrone Space

- **Calendars** – Schedule meetings, set reminders, and manage events across teams.
- **Projects** – Create projects, assign tasks, track progress, and manage deadlines.
- **Files** – Upload, version, preview, and share files with per‑person permissions.
- **Messages** – Chat with teammates and AI assistants in shared channels and threads.
- **Dashboard** – See all your tasks, projects, and team activity in a single, customizable view.

## Why Asynchrone Space

- **AI‑native**: AI is embedded in every surface—drafting docs, summarizing threads, suggesting next actions, and automating repetitive work.
- **Unified workspace**: No more switching between tools; everything you need lives in one platform.
- **Team‑first**: Built for collaboration, with shared context, threaded discussions, and clear ownership.

## Tech stack

- **Framework**: [Next.js](https://nextjs.org) (App Router) + React 19
- **Monorepo**: [Turborepo](https://turborepo.com) with npm workspaces
- **Database**: PostgreSQL via [Prisma](https://www.prisma.io) 7 (driver adapter `@prisma/adapter-pg`)
- **Auth**: [Better Auth](https://www.better-auth.com)
- **UI**: [shadcn/ui](https://ui.shadcn.com) + [Base UI](https://base-ui.com) + Tailwind CSS
- **AI**: [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/), exposed to clients over MCP
- **i18n**: [next-intl](https://next-intl.dev) (English and French)
- **Deployment**: Helm on Kubernetes, images published to GHCR

## Repository structure

| Path                         | Description                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `apps/copilot`               | Copilot: workspace, identity and OAuth 2.1/OIDC authorization server (App Router, i18n, API + MCP). |
| `apps/projects`              | Projects: domain app (`projects.copilot.asynchrone.space`), host-only OIDC session. |
| `apps/calendars`             | Calendars and meetings (`calendars.copilot.asynchrone.space`): calendar screens, meeting inbox and settings. |
| `apps/files`                 | Files (`files.copilot.asynchrone.space`): file tree, chunked upload/download APIs and the uploads-sweep cron. |
| `apps/messages`              | Messages: the messaging domain app (`messages.copilot.asynchrone.space`), host-only OIDC session. |
| `apps/clients`               | Clients: CRM domain app (`clients.copilot.asynchrone.space`), host-only OIDC session. |
| `apps/employees`             | Employees: HR domain app (`employees.copilot.asynchrone.space`), host-only OIDC session. |
| `apps/landing`               | Stateless public marketing site at `asynchrone.space` (no auth, database or session).                |
| `apps/control-tower`         | Internal platform administration app (organizations, users, audit, ops).            |
| `packages/db`                | Shared Prisma schema, migrations, `pg` pool and generated client (`@workspace/db`). |
| `packages/ui`                | Shared UI component library.                                                        |
| `packages/eslint-config`     | Shared ESLint configuration.                                                        |
| `packages/typescript-config` | Shared TypeScript configuration.                                                    |
| `charts/asynchrone-space`    | Helm umbrella chart for deploying every app.                                         |
| `docs/domain-app-template.md`| How the domain apps are built, tested and deployed (start here for a new app).       |

## Getting started

### Prerequisites

- **Node.js** >= 20.9.0
- **npm** 11 (declared via `packageManager`; run `corepack enable` to match)
- **Docker** (recommended) for a local PostgreSQL instance

### Setup

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

3. Create your environment file and fill in the values:

   ```bash
   cp apps/copilot/.env.example apps/copilot/.env
   ```

   At minimum set `DATABASE_URL` and `BETTER_AUTH_SECRET`. An `OPENAI_API_KEY`
   is only required for AI assistant features. See
   [Environment variables](#environment-variables) below.

4. Generate the Prisma client and apply migrations:

   ```bash
   npm run generate --workspace=@workspace/db
   cd packages/db && npx prisma migrate deploy
   ```

5. Start the dev server:

   ```bash
   npm run dev
   ```

   The app is available at http://localhost:3000.

> Prefer containers? `docker compose up --build` runs PostgreSQL, applies
> migrations, serves the public landing site on port **3002**, the Copilot app
> on port **3003**, the projects app on port **3004**, the calendars app on port
> **3005**, the files app on port **3006**, the messages app on port **3007**, the
> clients app on port **3008**, the employees app on port **3009** and the control
> tower on port **3001**. Each container loads its app's `.env` (then overrides
> `DATABASE_URL` and the public URLs), so local dev and Docker share the same
> secrets. The image is parameterised with
> `--build-arg APP=copilot|projects|calendars|files|messages|clients|employees|control-tower|landing`.

### Domain apps

`apps/projects` (port **3004**), `apps/calendars` (port **3005**),
`apps/files` (port **3006**), `apps/messages` (port **3007**),
`apps/clients` (port **3008**, the CRM) and `apps/employees` (port **3009**,
time & attendance, leave and payroll) are the domain apps: each serves
`http://localhost:<port>/{locale}/{orgSlug}/<domain>` and signs in throughCopilot (host-only session, no credential form). Each needs its own environment
file and the provisioned OAuth client credentials:

```bash
cp apps/projects/.env.example apps/projects/.env
cp apps/calendars/.env.example apps/calendars/.env
cp apps/files/.env.example apps/files/.env
cp apps/messages/.env.example apps/messages/.env
cp apps/clients/.env.example apps/clients/.env
cp apps/employees/.env.example apps/employees/.env
# then copy the PROJECTS_*/CALENDARS_*/FILES_*/MESSAGES_*/CLIENTS_*/EMPLOYEES_* pairs written by:
npm run oauth:clients --workspace=copilot -- --apply --write-env apps/copilot/.env.oauth
```

Start Copilot and the domain apps together (`npm run dev` starts all of them).
The remaining apps copy the template in
[`docs/domain-app-template.md`](./docs/domain-app-template.md). Copilot
308-redirects the old
`/{locale}/{orgSlug}/projects|calendars|files|messages|clients|contacts|deals|employees|hr`
paths to the owning host, so bookmarks and notification links keep working.### Control tower

The internal administration app is a separate Next.js app on
http://localhost:3001. It has its own Better Auth secret, host-only session
cookie and sign-in. During the database split it still uses the shared Prisma
package for platform auth; customer identity mutations go through Copilot's
`/internal/v1/admin/*` API. The platform-database cutover is a milestone #1
follow-up.

```bash
cp apps/control-tower/.env.example apps/control-tower/.env
npm run dev --workspace=control-tower
```

Accounts are created by Copilot. Grant a platform role to an existing
account:

```bash
npm run grant:platform-role --workspace=control-tower -- --email you@example.com
```

Only `platform_admin` (full) and `platform_support` (read-only) can open the app;
everyone else gets a 404. Every platform account must enroll a TOTP
authenticator (`/setup-2fa`) before the dashboard is reachable, and
`PLATFORM_ALLOWED_IPS` can restrict access to known networks. Admins can ban
accounts, revoke sessions, change plans/quotas and disable MCP clients from the
detail pages. Impersonation opens a one-hour, audited session in the customer
app through a single-use handoff (no shared cookie) and shows a banner there.

`npm run verify:auth-config --workspace=control-tower`
asserts that cross-subdomain cookies stay disabled (see
[ADR 0018](./docs/adr/0018-control-tower-on-shared-database-package.md)).

### Landing site

`apps/landing` is the public marketing site for `asynchrone.space`: home,
features, pricing, about, careers, contact, FAQ, blog and legal. It is
stateless — no database, no `@workspace/auth`, no session cookie — and builds
with no `DATABASE_URL`, `BETTER_AUTH_SECRET` or `BETTER_AUTH_URL`:

```bash
npm run dev --workspace=landing        # http://localhost:3002
npm run build --workspace=landing      # no database or auth env needed
npm run test:unit --workspace=landing
npm run verify:stateless --workspace=landing
npm run verify:legal-copy --workspace=landing
```

All account actions link to Copilot (`NEXT_PUBLIC_WORKSPACE_URL`, inlined at
build time; defaults to `https://copilot.asynchrone.space`). Canonical URLs,
`robots.txt` and `sitemap.xml` use `NEXT_PUBLIC_SITE_URL` (defaults to
`https://asynchrone.space`).

Old apex workspace URLs redirect to Copilot with a 308, keeping the locale and
query string: sign-in/sign-up, password reset, two-factor, consent, onboarding,
select-organization, accept-invitation, portal, settings, search, help,
feedback, `mcp`, `api/assistant`, and organization-scoped sections
(`/<orgSlug>/settings`, `/<orgSlug>/search`, `/<orgSlug>/help`, …). Marketing
paths are never shadowed; `MARKETING_SEGMENTS` in `apps/landing/lib/workspace.ts`
is the guard and the map is covered by unit tests. The landing is the only
indexable app: Copilot and the control tower send `X-Robots-Tag: noindex,
nofollow` and disallow `/` in `robots.txt`.

## Environment variables

Copilot variables live in `apps/copilot/.env` (see
[`apps/copilot/.env.example`](./apps/copilot/.env.example)); the domain apps read
their own file — `apps/projects/.env`, `apps/calendars/.env`, `apps/files/.env`
and `apps/messages/.env` (see the matching `.env.example`); the control tower
reads `apps/control-tower/.env` (see
[`apps/control-tower/.env.example`](./apps/control-tower/.env.example)); the
stateless landing reads only `apps/landing/.env` (see
[`apps/landing/.env.example`](./apps/landing/.env.example) for
`NEXT_PUBLIC_WORKSPACE_URL` and `NEXT_PUBLIC_SITE_URL`).

| Variable             | Required | Description                                                                                                                                                                    |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`       | Yes      | PostgreSQL connection string.                                                                                                                                                  |
| `DATABASE_POOL_MAX`  | No       | Max Postgres connections per instance (default `3`).                                                                                                                           |
| `BETTER_AUTH_SECRET` | Yes      | Secret used to sign sessions and encrypt the stored MCP/OAuth JWKS keys. Keep it stable across runtimes; clear the `jwks` table when rotating it.                              |
| `BETTER_AUTH_URL`    | Yes      | Public base URL of the app.                                                                                                                                                    |
| `OPENAI_API_KEY`     | No       | Enables AI assistant features.                                                                                                                                                 |
| `OPENAI_API_URL`     | No       | Custom OpenAI-compatible base URL.                                                                                                                                             |
| `ASSISTANT_MODEL`    | No       | Model used by the assistant (default `gpt-4o-mini`).                                                                                                                           |
| `MCP_RESOURCE_URL`   | No       | Public identifier of the OAuth2-protected `/mcp` endpoint (defaults to `${BETTER_AUTH_URL}/mcp`).                                                                              |
| `CRON_SECRET`        | No       | Bearer token guarding the scheduled routes (`/api/files/uploads/sweep` in `apps/files`, `/api/cron/repository-sync` in `apps/copilot`); put it in the Kubernetes Secrets so the charts' CronJobs authenticate. |

## Available scripts

Run these from the repository root; Turborepo fans them out to the relevant
workspaces.

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the dev servers in watch mode. |
| `npm run build`     | Build all workspaces.                |
| `npm run lint`      | Lint all workspaces.                 |
| `npm run typecheck` | Type-check all workspaces.           |
| `npm run format`    | Format with Prettier.                |

## File storage

Uploaded files are stored as **PostgreSQL large objects** (`pg_largeobject`) in the
same database as their metadata. There is no external object storage (the
former Vercel Blob integration has been removed). The upload/download APIs and
the `uploads-sweep` cron live in `apps/files` since #161
(`apps/files/lib/large-object.ts`).

- **Bytes → large objects.** `lib/large-object.ts` streams bytes into a large
  object and streams them back out. Responses use `Readable.toWeb(...)`; nothing
  is buffered in memory.
- **Chunked uploads.** A file is uploaded in 3 MiB chunks under an
  `UploadSession` instead of one request, which keeps each request small and
  makes retries cheap:
  - `POST /api/files/uploads` — authz + quota check, creates the large object and
    an `UploadSession` (`name`, `parentId`, `mimeType`, `expectedSize`, `transient`).
  - `PUT /api/files/uploads/[uploadId]` — appends one raw chunk; the
    `x-chunk-offset` header must equal the bytes already received (rejects gaps,
    duplicates, and reordering). Retries are safe.
  - `POST /api/files/uploads/[uploadId]/complete` — re-reads the stored bytes to
    validate size + SHA‑256, then creates the `FileNode`/`FileVersion` (or returns
    the `oid` for a transient message attachment).
  - `DELETE /api/files/uploads/[uploadId]` — aborts and unlinks the large object.
  - `GET /api/files/uploads/sweep` — unlinks sessions older than their lease
    (`CRON_SECRET`-guarded when set; also runs opportunistically on init).
- **Metadata → Prisma.** `FileNode`, `FileVersion`, and `MessageAttachment` hold
  `oid BigInt? @unique`, `sizeBytes`, `mimeType`, and `sha256`. `UploadSession`
  tracks in-progress uploads.
- **One shared pool.** `packages/db/src/prisma.ts` exports a single `pg.Pool` handed to
  `new PrismaPg(pool, { disposeExternalPool: false })`; Prisma and the
  large-object code share it. Each large-object operation runs on one dedicated
  connection inside a single `BEGIN … COMMIT` transaction (never `pool.query()`).
- **Downloads** stream the large object with `Content-Length`/`Content-Disposition`;
  `maxDuration` is set on the upload/download routes.

### Operational caveats

- **Connections are held for the duration of a transfer.** Each in-flight
  upload/download occupies one pooled connection (default pool max is 3). Raise
  `DATABASE_POOL_MAX` if transfers run concurrently with Prisma traffic, or use a
  separate pool for large objects. Point `DATABASE_URL` at a pooler in production.
- **No fixed per-file cap.** Uploads are bounded only by the organization's
  remaining storage quota (free 1 GiB / team 100 GiB / enterprise 1 TiB). A large
  download holds a pooled connection for the whole transfer, so very large files
  are best served from a dedicated media host.
- **In-memory retry only.** A failed chunk is retried within the session; uploads
  do not resume across page reloads. Abandoned sessions are unlinked after their
  lease expires.
- **No Blob migration.** Existing `storageKey` values were dropped in the
  `20261009140000_replace_blob_with_large_object` migration; old Blob bytes are
  not imported.
- **Deletes** unlink the backing large object(s) synchronously on a best-effort
  basis and log failures without failing the request.
- **SSL warning.** Set `sslmode=verify-full` (or
  `uselibpqcompat=true&sslmode=require`) in `DATABASE_URL` to silence the
  `pg-connection-string` deprecation warning on cold start.

### Verifying

`apps/copilot/scripts/verify-large-object.ts` uploads ≥8 MiB of random bytes, reads
them back, and asserts equal size and SHA‑256 for both the single-shot and the
chunked create/append/hash paths; it then deletes/aborts and asserts
`pg_largeobject_metadata` returns to its baseline (no orphans):

```bash
npm run verify:large-object --workspace=copilot
```

## Deployment

The Docker workflow publishes these images to GHCR:

| Image                                                      | Dockerfile stage               | Runs                       |
| ---------------------------------------------------------- | ------------------------------ | -------------------------- |
| `ghcr.io/preskater/asynchrone-space-copilot`               | `runner` (`APP=copilot`)       | Copilot (identity + OAuth) |
| `ghcr.io/preskater/asynchrone-space-projects`              | `runner` (`APP=projects`)      | Projects domain app        |
| `ghcr.io/preskater/asynchrone-space-clients`               | `runner` (`APP=clients`)       | Clients (CRM) domain app   |
| `ghcr.io/preskater/asynchrone-space-employees`             | `runner` (`APP=employees`)     | Employees (HR) domain app  |
| `ghcr.io/preskater/asynchrone-space-control-tower`         | `runner` (`APP=control-tower`) | Internal control tower     |
| `ghcr.io/preskater/asynchrone-space-landing`               | `runner` (`APP=landing`)       | Public landing site        |
| `ghcr.io/preskater/asynchrone-space-migrate`               | `migrate` (`APP=copilot`)      | One-shot Prisma migrations |

Deploy them with the Helm umbrella chart in `charts/asynchrone-space`, which composes the
`asynchrone-space-landing`, `asynchrone-space-copilot`,
`asynchrone-space-projects`, `asynchrone-space-clients`,
`asynchrone-space-employees` and `asynchrone-space-control-tower` subcharts:

```bash
helm dependency build charts/asynchrone-space
kubectl create namespace asynchrone-space

kubectl -n asynchrone-space create secret generic asynchrone-space-copilot-secrets \
  --from-literal=DATABASE_URL='postgresql://…' \
  --from-literal=BETTER_AUTH_SECRET='…' \
  --from-literal=CRON_SECRET='…'

kubectl -n asynchrone-space create secret generic asynchrone-space-clients-secrets \
  --from-literal=DATABASE_URL='postgresql://…' \
  --from-literal=CLIENTS_OAUTH_CLIENT_ID='…' \
  --from-literal=CLIENTS_OAUTH_CLIENT_SECRET='…'

kubectl -n asynchrone-space create secret generic asynchrone-space-employees-secrets \
  --from-literal=DATABASE_URL='postgresql://…' \
  --from-literal=EMPLOYEES_OAUTH_CLIENT_ID='…' \
  --from-literal=EMPLOYEES_OAUTH_CLIENT_SECRET='…'

kubectl -n asynchrone-space create secret generic asynchrone-space-control-tower-secrets \
  --from-literal=DATABASE_URL='postgresql://…' \
  --from-literal=CONTROL_TOWER_BETTER_AUTH_SECRET='…'

helm upgrade --install asynchrone-space charts/asynchrone-space -n asynchrone-space \
  --set global.imageTag=sha-abc1234
```

A pre-install/pre-upgrade Job runs `prisma migrate deploy` before the
Deployments roll out, and Kubernetes CronJobs replace the former Vercel crons.
See [docs/deployment/helm.md](./docs/deployment/helm.md) for chart values,
ingress/TLS, DNS, rollback and troubleshooting, and
[database operations](./docs/deployment/database-operations.md) for the
eight-database secrets, network policy, backups, restore order and connection
budget.

Paid plans are billed through Stripe Checkout; [docs/billing.md](./docs/billing.md)
covers the plan model, configuration and the test-mode procedure.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for
setup instructions and our workflow, and note our
[Code of Conduct](./CODE_OF_CONDUCT.md). To report a security issue, see
[SECURITY.md](./SECURITY.md).

## License

Asynchrone Space is **source-available**, not open source. It is licensed under
the [Elastic License 2.0](./LICENSE) (SPDX: `Elastic-2.0`) from 2026-10-30.

In short, you may use, copy, distribute and modify the software — including
running it for your own organization — but you may **not** provide it to third
parties as a hosted or managed service, and you may not remove or obscure
licensing, copyright or attribution notices.

Releases published before 2026-10-30 remain available under the MIT License;
the new terms apply prospectively. See
[ADR 0025](./docs/adr/0025-license-under-elastic-license-2.0.md) for the
rationale and [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for the
licences of the dependencies we distribute.

Contributions are accepted under the [CLA](./CLA.md).
