# Domain app template

`apps/projects` is the pilot for the domain-app split (#160); `apps/calendars`
and `apps/files` followed in #161, `apps/messages` in #162, and
`apps/clients`/`apps/employees` in #163. This document is the checklist for the
next app: copy the shape, not the code.Architecture and ownership: [domain-apps.md](./architecture/domain-apps.md),
[ADR 0028](./adr/0028-split-workspace-into-domain-apps.md),
[ADR 0036](./adr/0036-use-a-per-domain-app-template.md).

## Shape

```
apps/<domain>/
  package.json               name = "<domain>" (unscoped, like copilot)
  next.config.ts             createNextConfig({ outputFileTracingRoot, transpilePackages })
  proxy.ts                   next-intl middleware + foreign-route redirects
  i18n/request.ts            re-export @workspace/i18n/request
  app/
    [locale]/layout.tsx      fonts, ThemeProvider, NextIntlClientProvider, Toaster
    [locale]/page.tsx        locale root -> the signed-in org
    [locale]/sign-in/page.tsx
    [locale]/[orgSlug]/
      layout.tsx             requireWorkspace() + shell + domain providers
      page.tsx               -> the domain's default screen
      <domain>/...           the screens
    api/auth/{sign-in,callback,logout,backchannel-logout}/route.ts
    api/auth/switch/route.ts organization-switch handoff (ends the local session)
    internal/v1/auth/revoke/route.ts  session revocation (service token)
    internal/v1/domain/[operation]/route.ts  delegated domain API (#190)
    api/health/route.ts
  lib/
    env.ts                   fail-fast registry for this app's keys
    prisma.ts                the app's single database client
    oidc.ts                  OidcConfig + PrismaOidcSessionStore
    auth/session.ts          readSessionRecord()
    auth/return-to.ts        post-login path cookie
    auth/routing.ts          pure rules (token organization, 2FA gate)
    auth/workspace.ts        requireWorkspace(), toRequestContext()
    internal/service.ts      audience-bound ServiceTokenVerifier
    internal/domain.ts       delegated operation dispatch (#190)
    request-context.ts       getRequestContext(), revalidateOrgPath(), parseLocalized()
    <domain>/index.ts        adapter: binds db, audit, notifications, integrations
  actions/*.ts               "use server" actions (the app owns them)
  components/                app-local shell pieces (sidebar, header, switcher)
  e2e/                       Playwright specs + fixtures + bootstrap
```

URLs are `/{locale}/{orgSlug}/<domain>` on the app's own host, so an existing
Copilot path keeps working after the host swap. `/{locale}/{orgSlug}` redirects
to the domain's default screen.

## Authentication

- Only Copilot has credentials. Every other app is a relying party: sign-in is
  `GET /api/auth/sign-in` → authorization code + PKCE at Copilot → callback.
- `lib/oidc.ts` holds one `OidcConfig`: `issuer` is Copilot's origin, `resource`
  is the app's audience (`internalAudience("<domain>")`), `redirectUri` is
  `${<DOMAIN>_APP_URL}/api/auth/callback`.
- The session cookie is host-only (`__Host-asynchrone_session` over HTTPS) and
  holds the local session id, never a token. There is no shared `.copilot`
  cookie.
- `PrismaOidcSessionStore` (in `@workspace/oidc`) persists the session in the
  app's own `oidcSession` table. Store the model in the app's database; the
  helper only needs the `oidcSession` delegate.
- The callback keeps exactly one local session per Copilot `sid`: switching
  organization re-authorizes and must not leave the previous organization's
  session behind.
- `readSessionRecord()` verifies the access token on every request (signature,
  issuer, audience, expiry with 60-second skew) and rejects a token whose
  `sub`/`sid`/organization no longer matches the stored row.
- Back-channel logout is `POST /api/auth/backchannel-logout`; `logout` deletes
  the local row and calls Copilot's end-session endpoint.
- `/api/auth/switch` deletes the local row and clears the cookie before the
  handoff; Copilot's `/organization/set-active` calls
  `/internal/v1/auth/revoke` on every domain app with the `sid`.
- Every app also enforces the token's `twoFactorRequired`/`twoFactorEnrolled`
  claims together with the current policy and the one-hour impersonation TTL.

### Issuer claim

`OidcConfig.issuer` is an origin, but Better Auth publishes `${origin}/api/auth`
as the token issuer. `oidcIssuer()` in `@workspace/oidc` supplies the value used
for JWKS verification; do not compare `iss` against the bare origin.

## Workspace resolution and gates

`requireWorkspace({ locale, orgSlug, returnTo })` composes the shared
`resolveWorkspace()` from `@workspace/app-shell` with three app rules:

1. the local session must still map to a live Copilot session (`sid`);
2. the token is bound to one organization — visiting another membership
   redirects to the token's organization, and a lost membership signs out;
3. the organization's 2FA policy is enforced on the page as well as at the
   authorization endpoint: unenrolled members go to
   `${COPILOT_APP_URL}/{locale}/two-factor/setup`.

Server actions cannot read the route, so `getRequestContext()` derives the
organization from the OIDC session and the role from the membership row. Never
accept an organization id from the client, and never call `getLocale()` inside an
action (next-intl resolves it through `next/root-params`, which actions cannot
read) — revalidate every locale instead.

## Organization switch

Copilot owns the session's active organization and the domain app's token is
issued for one organization. `components/org-switcher.tsx` links to the local
`/api/auth/switch`, which forwards to Copilot's
`/{locale}/select-organization?redirectTo=<app>/api/auth/sign-in?returnTo=…`.
Copilot updates the active organization and returns into the app's sign-in flow.
Copilot only redirects to a registered customer origin and only to its
`/api/auth/sign-in` path.

## Databases

Each app owns one `@workspace/db-<domain>` package and imports only that. A
domain package reads identity rows (`member`, `user`, `account`) through
`IdentityClient` and other domains through their `/internal/v1/*` APIs; it never
imports a second database client. The domain package defines a port
(`MemberDirectoryPort`, `ProjectDb`, …) and the app binds the database client,
large-object store, audit writer, rate limiter and notification ingress.

A new app also mounts the standard internal surface:
`GET /internal/v1/search`, `GET /internal/v1/organizations/:id/export`,
`DELETE /internal/v1/organizations/:id`, `DELETE /internal/v1/users/:id` and the
four `/internal/v1/audit*` routes. Copy the route files from `apps/projects` and
bind the app's own Prisma client.

## Environment

Add a `lib/env.ts` with the required keys, an `.env.example`, and the keys to the
`env` arrays in the root `turbo.json` (build + dev):

| Key                                      | Purpose                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `<DOMAIN>_APP_URL`                       | Public origin; redirect, logout and back-channel URIs derive from it                    |
| `COPILOT_APP_URL`                        | OIDC issuer and identity server                                                         |
| `<DOMAIN>_OAUTH_CLIENT_ID/SECRET`        | Provisioned client credentials (`npm run oauth:clients --workspace=copilot -- --apply`) |
| `<DOMAIN>_DATABASE_URL`                  | The app's own database (falls back to `DATABASE_URL` for local convenience)              |
| `TRUSTED_IP_HEADERS`                     | Audit IP column; empty stores no address                                                |

`next build` must not connect to anything: add build-time placeholders in the
`Dockerfile` and in the CI `ci` job when a key is read at build time.

## Infrastructure

- `Dockerfile`: `docker build --build-arg APP=<domain>` (the `runner` stage
  copies `apps/<domain>/.next`).
- `docker-compose.yml`: one service on the app's development port with its own
  `env_file`.
- `.github/workflows/docker.yml`: one matrix entry + GHCR image
  `asynchrone-space-<domain>`.
- `charts/asynchrone-space`: add one dependency alias on the generic
  `charts/asynchrone-space-app` chart and a values block for the app (host,
  image, `config`, `secret.existingSecret`, optional cron jobs), then run
  `helm dependency build charts/asynchrone-space` and commit `Chart.lock` and
  the vendored archive. Do not copy a per-app chart; the app-specific values
  are all the generic chart needs.
- `.github/workflows/helm.yml` needs no per-app entry: `npm run verify:helm`
  reads the umbrella and renders every alias. Add the new alias to the `APPS`
  list in `scripts/verify-helm-charts.mjs`.
- `packages/contracts` already has the app key, host env, database name,
  audience and OAuth client env names; check it before adding anything.
- Add the app to the connection budget in `packages/db-core/src/budget.ts`
  (`poolMax`, default replicas, HPA ceiling), to
  `charts/asynchrone-space/values.yaml` (`config.DATABASE_POOL_MAX`,
  `replicaCount`, `autoscaling.maxReplicas`) and to
  `connectionBudget.appPoolMax`; `npm run verify:connection-budget` fails
  otherwise (ADR 0038).

## Observability

Copy the four files every app has (see `docs/observability.md`):

- `instrumentation.ts` and `instrumentation-client.ts` (Sentry, disabled while
  `SENTRY_DSN` is empty);
- `app/api/health/route.ts` using `createHealthRoute` with the app's own
  database check and pool;
- `app/api/metrics/route.ts` using `createMetricsRoute`;
- `lib/internal/invalidation.ts` plus
  `app/internal/v1/invalidate/route.ts` using `createInvalidationHandler`, so
  Copilot can clear this app's cached reads after a cross-domain mutation.

Wrap the proxy response in `withCorrelation` and cron routes in
`createCronRoute`. Add `@workspace/observability` to `transpilePackages` (the
default list in `@workspace/next-config` already includes it) and to the app's
`package.json`.

## Tests

- Unit: pure rules (`lib/auth/routing.ts`), adapters and helpers; `vitest`.
- Playwright: sign-in through Copilot, organization switch and one domain flow.
  `e2e/bootstrap.ts` provisions the OAuth client with a fixed secret so the
  suite needs no admin session; `playwright.config.ts` starts both apps.
- Add the app to CI: `npm run test:unit --workspace=<domain>`, a dedicated e2e
  job, and the boundary check picks the app up automatically.

## Redirects

`apps/copilot/proxy.ts` redirects `/{locale}/{orgSlug}/<domain>[/...]` to the new
host with a 308, keeping the path. Domain apps redirect routes they do not own
(settings, clients, the portal) back to Copilot. Nothing in the old app should
still render the moved screens.

## Notes for a new app

- Identity reads (`member`, `user`, `account`, `session`) go through
  `IdentityClient`; the member directory, workspace gate, presence and portal
  access are all `/internal/v1/*` calls.
- Polling reads and other background requests go through route handlers with a
  plain `fetch`, never server actions. A server-action response applies an RSC
  payload through the client router: it re-renders the route (overwriting the
  client store with fresh `initialData`) and can abort an in-flight navigation,
  which broke the organization-switch handoff in the messages app (#171).
  Server actions are for mutations only.
- Meeting settings render at `/{locale}/{orgSlug}/calendars/settings`; Copilot's
  organization settings tab links there.
- Repository webhook delivery (`/api/webhooks/repositories/:id`) and the sync UI
  live in the projects app.
- The assistant, MCP and portal call the domain's
  `/internal/v1/domain/:operation` API; no Copilot adapter imports the app.
- Impersonation is detected from the Copilot session row (`sid`); the token has
  no impersonation claim yet, so the banner and the 1-hour TTL are enforced by
  the identity workspace read, not by the claims.

## Environment

Add a `lib/env.ts` with the required keys, an `.env.example`, and the keys to the
`env` arrays in the root `turbo.json` (build + dev):

| Key                                      | Purpose                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `<DOMAIN>_APP_URL`                       | Public origin; redirect, logout and back-channel URIs derive from it                    |
| `COPILOT_APP_URL`                        | OIDC issuer and identity server                                                         |
| `<DOMAIN>_OAUTH_CLIENT_ID/SECRET`        | Provisioned client credentials (`npm run oauth:clients --workspace=copilot -- --apply`) |
| `<DOMAIN>_DATABASE_URL`                  | The app's own database (falls back to `DATABASE_URL` for local convenience)              |
| `TRUSTED_IP_HEADERS`                     | Audit IP column; empty stores no address                                                |

`next build` must not connect to anything: add build-time placeholders in the
`Dockerfile` and in the CI `ci` job when a key is read at build time.

## Infrastructure

- `Dockerfile`: `docker build --build-arg APP=<domain>` (the `runner` stage
  copies `apps/<domain>/.next`).
- `docker-compose.yml`: one service on the app's development port with its own
  `env_file`.
- `.github/workflows/docker.yml`: one matrix entry + GHCR image
  `asynchrone-space-<domain>`.
- `charts/asynchrone-space`: add one dependency alias on the generic
  `charts/asynchrone-space-app` chart and a values block for the app (host,
  image, `config`, `secret.existingSecret`, optional cron jobs), then run
  `helm dependency build charts/asynchrone-space` and commit `Chart.lock` and
  the vendored archive. Do not copy a per-app chart; the app-specific values
  are all the generic chart needs.
- `.github/workflows/helm.yml` needs no per-app entry: `npm run verify:helm`
  reads the umbrella and renders every alias. Add the new alias to the `APPS`
  list in `scripts/verify-helm-charts.mjs`.
- `packages/contracts` already has the app key, host env, database name,
  audience and OAuth client env names; check it before adding anything.
- Add the app to the connection budget in `packages/db-core/src/budget.ts`
  (`poolMax`, default replicas, HPA ceiling), to
  `charts/asynchrone-space/values.yaml` (`config.DATABASE_POOL_MAX`,
  `replicaCount`, `autoscaling.maxReplicas`) and to
  `connectionBudget.appPoolMax`; `npm run verify:connection-budget` fails
  otherwise (ADR 0038).

## Observability

Copy the four files every app has (see `docs/observability.md`):

- `instrumentation.ts` and `instrumentation-client.ts` (Sentry, disabled while
  `SENTRY_DSN` is empty);
- `app/api/health/route.ts` using `createHealthRoute` with the app's own
  database check and pool;
- `app/api/metrics/route.ts` using `createMetricsRoute`;
- `lib/internal/invalidation.ts` plus
  `app/internal/v1/invalidate/route.ts` using `createInvalidationHandler`, so
  Copilot can clear this app's cached reads after a cross-domain mutation.

Wrap the proxy response in `withCorrelation` and cron routes in
`createCronRoute`. Add `@workspace/observability` to `transpilePackages` (the
default list in `@workspace/next-config` already includes it) and to the app's
`package.json`.

## Tests

- Unit: pure rules (`lib/auth/routing.ts`), adapters and helpers; `vitest`.
- Playwright: sign-in through Copilot, organization switch and one domain flow.
  `e2e/bootstrap.ts` provisions the OAuth client with a fixed secret so the
  suite needs no admin session; `playwright.config.ts` starts both apps.
- Add the app to CI: `npm run test:unit --workspace=<domain>`, a dedicated e2e
  job, and the boundary check picks the app up automatically.

## Redirects

`apps/copilot/proxy.ts` redirects `/{locale}/{orgSlug}/<domain>[/...]` to the new
host with a 308, keeping the path. Domain apps redirect routes they do not own
(settings, clients, the portal) back to Copilot. Nothing in the old app should
still render the moved screens.
