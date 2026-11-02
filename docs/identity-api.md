# Identity internal API

Copilot exposes the identity read model at `/internal/v1/*` for workspace apps.
It replaces direct reads of the identity database from every domain app.

## Endpoints

| Method | Path                                          | Response       |
| ------ | --------------------------------------------- | -------------- |
| `GET`  | `/internal/v1/organizations/:id`              | `Organization` |
| `GET`  | `/internal/v1/organizations/:id/members`      | `Member[]`     |
| `GET`  | `/internal/v1/organizations/:id/entitlements` | `Entitlements` |
| `GET`  | `/internal/v1/users/:id`                      | `User`         |

The schemas and route constants live in `@workspace/contracts`. Every success
response is `{ data, meta: { app: "copilot", version: "v1", requestId } }` with
`Cache-Control: private, max-age=30`. Errors are
`{ error: { code, message } }`.

`Member` includes `clientId` so callers can exclude portal accounts from
workspace pickers. `Entitlements` includes `seats: null` for unlimited plans.

## Authentication

The handler uses `@workspace/service-auth`:

- audience `urn:asynchrone:app:copilot`;
- required scope `internal:identity:read`;
- issuer `COPILOT_APP_URL` or `BETTER_AUTH_URL`;
- JWKS from Copilot.

The route is excluded from the next-intl middleware and is never public.
Ingress must return 404 for `/internal/*`; that enforcement lands in #192.

## Control-tower admin API

The control tower mutates customer identity only through
`/internal/v1/admin/*`, authenticated with
`internal:identity:admin`. `IdentityAdminClient` in `@workspace/contracts` is the
typed caller; the control tower instantiates it in
`apps/control-tower/lib/platform/identity.ts`.

| Method | Path                                                | Purpose                               |
| ------ | --------------------------------------------------- | ------------------------------------- |
| `GET`  | `/internal/v1/admin/organizations`                  | Search/list organizations             |
| `GET`  | `/internal/v1/admin/organizations/:id`              | Organization details                  |
| `GET`  | `/internal/v1/admin/organizations/:id/detail`       | Detail page: members, clients, audit  |
| `POST` | `/internal/v1/admin/organizations/:id/plan`         | Manual plan/quota override            |
| `POST` | `/internal/v1/admin/organizations/:id/release-plan` | Return to provider-driven state       |
| `POST` | `/internal/v1/admin/organizations/:id/trial`        | Start/end a trial                     |
| `GET`  | `/internal/v1/admin/users`                          | Search/list users                     |
| `GET`  | `/internal/v1/admin/users/:id`                      | User details                          |
| `GET`  | `/internal/v1/admin/users/:id/detail`               | Detail page: memberships, sessions    |
| `POST` | `/internal/v1/admin/users/:id/ban`                  | Ban/unban and revoke sessions         |
| `POST` | `/internal/v1/admin/users/:id/sessions`             | Revoke sessions (support-safe)        |
| `POST` | `/internal/v1/admin/handoffs`                       | Create a single-use impersonation URL |
| `GET`  | `/internal/v1/admin/overview`                       | Platform counts and newest orgs       |
| `GET`  | `/internal/v1/admin/ops`                            | Sessions, keys, clients, AI spend     |
| `GET`  | `/internal/v1/admin/audit`                          | Latest customer audit rows, all orgs  |
| `GET`  | `/internal/v1/admin/oauth-clients/:clientId`        | One OAuth client                      |
| `POST` | `/internal/v1/admin/oauth-clients/:clientId`        | Enable/disable an OAuth client        |

The organization and user lists accept `query`, `cursor`, `offset` and `limit`
(`limit` caps at 100). `offset` backs the page-number UI; `cursor` is available
for cursor-style callers.

Platform mutations are audited by the control tower in its own
`PlatformAuditEvent`, never in the customer `AuditLog`. The handoff row is
created in the identity database so the customer app can consume it; the
control tower still owns its host-only session and never shares cookies
(ADR 0018). Everything else the control tower displays — including
`GET /admin/audit` — is read from this API; the two apps never share a database
(ADR 0034, [control-tower-database.md](./control-tower-database.md)).

## Client

`@workspace/contracts` exports `IdentityClient`:

```ts
import { IdentityClient, SERVICE_SCOPES } from "@workspace/contracts"
import { ServiceTokenClient } from "@workspace/service-auth"

const tokens = new ServiceTokenClient({
  issuer: process.env.COPILOT_APP_URL!,
  clientId: process.env.PROJECTS_OAUTH_CLIENT_ID!,
  clientSecret: process.env.PROJECTS_OAUTH_CLIENT_SECRET!,
})

const identity = new IdentityClient({
  baseUrl: process.env.COPILOT_APP_URL!,
  getToken: ({ audience, scopes }) => tokens.getToken({ audience, scopes }),
})

const members = await identity.listMembers(organizationId)
identity.invalidate(organizationId)
```

The client caches each path for 30 seconds. Call `invalidate(organizationId)`
after a member/role mutation. The token getter is injected so the contracts
package does not depend on `service-auth`.

## Data source

The handler reads `@workspace/db-identity` (`IDENTITY_DATABASE_URL`). It does not
use the monolith database. Local tests use a fake `IdentityRepository`; after
#185 the identity database is the source of truth.

## Domain callers

The assistant, MCP tools and the client portal resolve the user, organization
and role in Copilot, then send that identity as a **delegated context** to the
domain apps (`POST /internal/v1/domain/:operation`). They do not call the
identity API per tool call. Portal access management (`listAccess`, `invite`,
`revoke`, `cancelInvite`, `claim`) stays in Copilot because it owns Better Auth
invitations and the `Member.clientId` link.

## Tests

```bash
npm run test:unit --workspace=copilot
npm run test:unit --workspace=@workspace/contracts
```

Covers route selection, 404s, service-token failures, cache headers and the
typed client’s caching/error mapping.

## Follow-up

- #192 ingress/network enforcement.
