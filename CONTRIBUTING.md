# Contributing to Asynchrone Space

Thanks for your interest in improving Asynchrone Space! This document explains how to set
up the project, make changes, and submit them.

By participating you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Ways to contribute

- Report bugs or request features using our
  [issue templates](https://github.com/preskater/asynchrone/issues/new/choose).
- Improve docs (see the [documentation template](https://github.com/preskater/asynchrone/issues/new/choose)).
- Submit a pull request for an open issue. Issues labelled
  [`good first issue`](https://github.com/preskater/asynchrone/labels/good%20first%20issue)
  and [`help wanted`](https://github.com/preskater/asynchrone/labels/help%20wanted)
  are great starting points.
- Review pull requests and join [discussions](https://github.com/preskater/asynchrone/discussions).

## Prerequisites

- **Node.js** >= 20.9.0 (see `engines` in `package.json`).
- **npm** 11 (declared via `packageManager`; run `corepack enable` to match).
- **Docker** (recommended) for a local PostgreSQL instance, or your own
  PostgreSQL 18 server.

## Setup

1. **Fork and clone** the repository, then install dependencies from the repo
   root:

   ```bash
   npm install
   ```

2. **Start PostgreSQL.** The quickest option is Docker:

   ```bash
   docker compose up -d postgres
   ```

   (If you already run PostgreSQL locally, skip this and point each
   `*_DATABASE_URL` — or `DATABASE_URL` as the fallback — at it instead.)

3. **Configure environment variables.** Copy the example file and fill in the
   values:

   ```bash
   cp apps/copilot/.env.example apps/copilot/.env
   ```

   At minimum, set `IDENTITY_DATABASE_URL` (or `DATABASE_URL`) and a
   `BETTER_AUTH_SECRET` (any random string). Each domain app reads its own
   `apps/<app>/.env` (`*_APP_URL`, `*_OAUTH_CLIENT_ID/SECRET` and its
   `*_DATABASE_URL`); see the matching `.env.example`. An `OPENAI_API_KEY` is
   only needed for AI assistant features.

4. **Create the per-app databases, apply migrations and generate the Prisma
   clients:**

   ```bash
   npm run db:create
   npm run migrate:deploy
   npm run verify:migrations
   npm run generate:all
   npm run generate --workspaces --if-present
   ```

   `db:create` creates `asynchrone_identity`, the seven domain databases and
   their shadow databases from the fixed map in
   `packages/migrate/src/databases.mjs`. Provide the `*_DATABASE_URL` keys (see
   `apps/copilot/.env.example`).

5. **Run the app:**

   ```bash
   npm run dev
   ```

   The Copilot app is available at http://localhost:3000 and the control tower
   at http://localhost:3001.

## Project structure

This is a [Turborepo](https://turborepo.com) monorepo managed with npm
workspaces.

| Path                                                   | Description                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `apps/copilot`                                         | Copilot: workspace shell, identity and OAuth 2.1/OIDC authorization server. |
| `apps/control-tower`                                   | Internal platform administration app.                                 |
| `packages/contracts`                                   | App/database registry, internal API contracts and typed clients.      |
| `packages/audit`                                       | Per-app audit write/read/export/prune core.                           |
| `packages/sagas`                                       | Cross-database export/deletion orchestration.                         |
| `packages/search`                                      | Per-app internal search handler.                                      |
| `packages/oidc`, `packages/service-auth`               | OAuth client and service-token primitives.                            |
| `packages/db`, `packages/db-*`                         | Monolith schema plus one Prisma package per app.                      |
| `packages/ui`                                          | Shared UI component library.                                          |
| `packages/eslint-config`, `packages/typescript-config` | Shared tooling.                                                       |

## Scripts

Run these from the repository root; Turborepo fans them out to the relevant
workspaces.

| Command                                              | Description                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev`                                        | Start the dev servers in watch mode.                                                              |
| `npm run build`                                      | Build all workspaces.                                                                             |
| `npm run lint`                                       | Lint all workspaces.                                                                              |
| `npm run typecheck`                                  | Type-check all workspaces.                                                                        |
| `npm run format`                                     | Format with Prettier.                                                                             |
| `npm run test:unit`                                  | Every workspace's Vitest suite (Turbo).                                                           |
| `npm run test:e2e --workspace=<app>`                  | Per-app Playwright against migrated per-app databases.                                            |
| `npm run test:e2e --workspace=@workspace/e2e`         | Cross-app OIDC, portal and failure-injection suite.                                               |
| `npm run test:e2e --workspace=copilot`                   | Playwright against a migrated database.                                                           |
| `npm run check:boundaries`                           | Enforce workspace and database ownership.                                                         |
| `npm run verify:prisma-schemas`                      | Validate every generated Prisma schema.                                                           |

Unit tests use `*.unit.test.ts` next to the code. There is no separate test
package; add a test beside the module you change.

## Making a change

1. Create a branch off `main` with a descriptive name, e.g.
   `feat/bulk-task-actions` or `fix/calendar-timezone`.
2. Make your change, keeping it focused, and follow the existing code style
   (see `.prettierrc` and `.eslintrc.js` / workspace `eslint.config.js` files).
3. Run the checks before pushing (CI runs the same order):

   ```bash
   npm run lint \
     && npm run check:boundaries \
     && npm run verify:prisma-schemas \
     && npm run typecheck \
     && npm run build
   ```

   Add `npm run test:unit` when you touch runtime code.

4. Commit using [Conventional Commits](https://www.conventionalcommits.org/)
   prefixes (`feat:`, `fix:`, `docs:`, `chore:`, …), matching the existing git
   history.
5. Open a pull request against `main` and fill out the template. Link the issue
   it addresses (e.g. `Closes #123`).

We aim to review pull requests within a few business days. `main` is protected:
changes land through pull requests once CI passes.

## Reporting security issues

Please **do not** open a public issue for security vulnerabilities. See
[SECURITY.md](./SECURITY.md) for how to report them privately.

## License and contributor agreement

Asynchrone Space is source-available under the [Elastic License 2.0](./LICENSE),
effective 2026-10-30 (see
[ADR 0025](./docs/adr/0025-license-under-elastic-license-2.0.md)). It is not an
open-source project: the licence forbids offering the software to third parties
as a hosted or managed service.

We ask every contributor to sign the [Contributor License Agreement](./CLA.md)
before a pull request can be merged. The CLA keeps the project's licensing
flexible — it lets the maintainers keep distributing your contribution under the
Elastic License 2.0 and, if the commercial model changes, under different terms —
without having to track down every past contributor. Sign it once by commenting
the sign-off line on your first pull request; the maintainers record it and it
then covers all your later contributions.
