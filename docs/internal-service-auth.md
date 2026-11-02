# Internal service authentication

Workspace apps call each other through `/internal/v1/*` endpoints. Every call
carries a short-lived OAuth **client-credentials** token issued by Copilot. The
audience is the target app, and the scope set is explicit
([ADR 0029](../adr/0029-use-copilot-as-oauth-authorization-server.md),
[ADR 0032](../adr/0032-give-each-app-its-own-database.md)).

`@workspace/service-auth` is the shared implementation. Do not call an internal
endpoint with a shared secret or an unauthenticated `fetch`.

## Caller

```ts
import { ServiceTokenClient, SERVICE_SCOPES } from "@workspace/service-auth"

const client = new ServiceTokenClient({
  issuer: "https://copilot.asynchrone.space",
  clientId: process.env.PROJECTS_OAUTH_CLIENT_ID!,
  clientSecret: process.env.PROJECTS_OAUTH_CLIENT_SECRET!,
})

const token = await client.getToken({
  audience: "urn:asynchrone:app:files",
  scopes: [SERVICE_SCOPES.domainRead],
})

await fetch("https://files.copilot.asynchrone.space/internal/v1/files/123", {
  headers: { Authorization: `Bearer ${token}` },
})
```

- The client posts `grant_type=client_credentials`, `resource=<audience>` and
  `scope=<scopes>` to `/api/auth/oauth2/token` with `client_secret_basic`.
- Tokens are cached per audience/scope set and refreshed 30 seconds before
  expiry.
- Call `client.clear(request)` after a `401` if the target revoked the token.

## Handler

```ts
import {
  SERVICE_SCOPES,
  ServiceTokenVerifier,
  requireInternalService,
} from "@workspace/service-auth"

const verifier = new ServiceTokenVerifier({
  issuer: process.env.COPILOT_APP_URL!,
  audience: "urn:asynchrone:app:projects",
})

export async function GET(request: Request) {
  const claims = await requireInternalService(request, verifier, {
    requiredScopes: [SERVICE_SCOPES.domainRead],
  })
  // claims.sub is the calling app; claims.client_id is its OAuth client.
}
```

The verifier checks the signature against Copilot's JWKS, the issuer, the
audience, expiry and required scopes. A token minted for another app is
rejected. Better Auth stamps `iss` as `{origin}/api/auth`; the verifier accepts
that and the bare origin so already-issued tokens and the package tests keep
working.

## Scope matrix

| Caller        | Target      | Scopes                                                                                                                                          |
| ------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Copilot       | domain apps | `internal:domain:read`, `internal:domain:write`, `internal:audit:read`, `internal:search:read`, `internal:export:read`, `internal:delete:write` |
| Domain apps   | Copilot     | `internal:identity:read`, `internal:notifications:write`                                                                                        |
| Control tower | Copilot     | `internal:identity:read`, `internal:identity:admin`                                                                                             |

`SERVICE_SCOPES` in `@workspace/contracts` is the source of truth.

## Delegated domain calls

The assistant, MCP tools and the client portal run inside Copilot but their
data belongs to the domain apps. They use the same client-credentials token and
add a **delegated context** to the request:

```ts
POST /internal/v1/domain/create-project
Authorization: Bearer <client-credentials token>
Idempotency-Key: 7f4c…

{
  "context": {
    "userId": "user_123",
    "userName": "Alice",
    "userEmail": "alice@example.com",
    "organizationId": "org_123",
    "role": "admin",
    "impersonatedBy": null,
    "portal": null
  },
  "input": { "name": "Launch" }
}
```

- One operation per path (`/internal/v1/domain/:operation`), shared by the
  domain apps.
- The token proves the calling app; the delegated context proves on whose
  behalf it acts. The target app still applies its own organization, role,
  portal-visibility and row-level rules and never trusts an id from the caller.
- Portal callers set `portal.clientId` / `portal.clientName`. The projects and
  clients apps filter every read by that company, so a portal account cannot
  read another company's project or document.
- Mutations accept an optional `Idempotency-Key`. A retry with the same key
  replays the first result instead of running the mutation twice; reads are
  never replayed.
- The target app writes the audit row (`recordUserAudit` with its own database
  client) and its notification side effects.
- Copilot's typed client lives in `@workspace/contracts` (`DomainClient`); the
  gateway binds the token cache in `apps/copilot/lib/internal/domain.ts`.
- Failures are typed: `DomainClientError` carries `code`, `status` and a
  `retryable` flag. Reads retry transient failures; writes retry only with an
  idempotency key.

`createDomainHandler` from `@workspace/service-auth` implements the verifier,
scope check, envelope, typed error mapping and per-process idempotency cache for
a domain app.

## Network boundary

`/internal/*` is never exposed through public ingress. The deployment adds a
`NetworkPolicy` (Kubernetes) or relies on the compose network, and the ingress
must return 404 for the path. Each domain app's `proxy.ts` matcher also excludes
`internal` (like Copilot's), otherwise next-intl redirects the call to
`/{locale}/internal/...` and the handler is never reached.

## Errors

`ServiceAuthError` carries `code` and `status`:

| Code                   | Status   | Meaning                                      |
| ---------------------- | -------- | -------------------------------------------- |
| `missing_token`        | 401      | No Bearer header                             |
| `invalid_token`        | 401      | Signature, issuer, audience or expiry failed |
| `invalid_claims`       | 401      | Required claims are missing                  |
| `insufficient_scope`   | 403      | Token lacks a required scope                 |
| `missing_scope`        | 400      | Caller requested no scopes                   |
| `token_request_failed` | upstream | Token endpoint rejected the client           |

Map these directly; do not leak the token or client secret in the response.

## Verification

```bash
npm run test:unit --workspace=@workspace/service-auth
npm run typecheck --workspace=@workspace/service-auth
npm run lint --workspace=@workspace/service-auth
```

Covers token requests, caching, expiry skew, audience binding, scope checks,
expired tokens and missing Bearer headers.

## Follow-up

- #182 provisions the client IDs/secrets and `client_credentials_scopes`.
- #186 adds the identity internal API handlers.
- #192 adds ingress/network enforcement.
