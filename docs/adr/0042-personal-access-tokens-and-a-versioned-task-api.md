# 0042. Personal access tokens and a versioned task API served by Copilot

- Status: accepted
- Date: 2026-11-12
- Deciders: platform
- Issue: #133 (developer slice of #96)

## Context

The only programmatic surface is the MCP endpoint (ADR 0011). It is the right
transport for AI clients but not for a shell or a CI job: MCP needs a JSON-RPC
handshake, browser consent and a registered client. Developers want to paste a
token into a config file and create or list tasks from a script.

Since the database split (ADR 0032) Copilot owns users, members, entitlements
and the shared `rateLimit` table, and reaches the domain apps through the
delegated call (`POST /internal/v1/domain/:operation`), where the target app
re-applies its own rules and writes its own audit rows. The MCP tools already
create and update tasks this way.

#96 tracks the wider public REST API and webhooks. This record fixes the
conventions `/api/v1` starts with, so #96 extends them instead of inventing a
second shape.

## Considered options

1. **Reuse the OAuth access tokens** issued by `mcp()`. Short-lived and bound to
   a client registration and a consent screen; a developer cannot simply mint
   one for a script.
2. **Serve `/api/v1` from each domain app** with its own token check. Every
   app would need the token table, the entitlement check and the rate limiter,
   and a token would have to be verified against the identity database from
   seven places.
3. **Personal access tokens in the identity database, `/api/v1` served by
   Copilot**, which turns a token into a delegated call exactly like the MCP
   tools.

## Decision

Option 3.

### Tokens

- `ApiToken` lives in `asynchrone_identity`: `organizationId`, `userId`,
  `name`, `prefix`, `tokenHash`, `scopes`, `expiresAt`, `lastUsedAt`,
  `revokedAt`. It cascades with its user and organization, so the deletion
  sagas cover it without a new step.
- Format: `asy_<8 lowercase alphanumerics>_<43 base64url characters>`. The
  first part (`asy_xxxxxxxx`) is the `prefix`: unique, stored in clear, shown in
  the UI and in audit rows, and used to look the row up. The full token is
  hashed with SHA-256 and compared in constant time. The plaintext is returned
  once, at creation, and is not recoverable.
- A token belongs to one organization and one member. Every request resolves the
  member's **current** roles, so removing the member or lowering their role
  takes effect immediately. A token can never do more than its owner: the
  scope is checked by Copilot, the role by the target app.
- Expiry is mandatory: 1 to 365 days (UI presets 30 / 90 / 365, default 90).
  There is no eternal token; a user creates a new one.
- Any member manages their own tokens. Admins and owners (`member:manage`) can
  list and revoke every token of the organization. Portal accounts cannot
  create tokens, and neither can a control-tower impersonation session: the
  token would outlive its one-hour limit.
- Creation and revocation write `api_token.created` / `api_token.revoked`
  audit rows in Copilot.

### Scopes

`projects:read` (projects and their labels), `members:read`, `tasks:read`,
`tasks:write`. A new resource adds `<resource>:read|write`; there is no
wildcard scope.

### `/api/v1` conventions

- Authentication: `Authorization: Bearer asy_…` only. Cookies are ignored, so
  the routes are not exposed to CSRF and need no origin check.
- Success: `{ "data": … }`; lists are `{ "data": [ … ], "nextCursor": null }`.
  `nextCursor` is reserved for keyset pagination, added per resource when a
  list can grow past one response.
- Errors reuse `jsonError`: `{ "error": { "code", "message", "params",
  "details" } }` with these codes:

  | Status | Code                            | When                                        |
  | ------ | ------------------------------- | ------------------------------------------- |
  | 401    | `token_invalid`                 | Missing, malformed or unknown token         |
  | 401    | `token_expired`                 | Past `expiresAt`                            |
  | 401    | `token_revoked`                 | Revoked, or its owner left the organization |
  | 403    | `token_scope_missing`           | The token lacks the route's scope           |
  | 403    | `upgrade_required`              | The plan has no `apiAccess`                 |
  | 403    | `forbidden` / `role_cannot_…`   | The owner's role forbids the action         |
  | 404    | `not_found`                     | Unknown id, including another organization  |
  | 422    | `validation_error`              | Invalid body or query                       |
  | 429    | `rate_limited` (+ `Retry-After`)| Per-token limit reached                     |

- Rate limit: per token, in the shared `rateLimit` table, fail closed, per
  minute: Free 60, Team 300, Enterprise 1 200.
- Mutations accept `Idempotency-Key` and forward it to the delegated call.
- Tasks created through the API never open a repository issue unless the
  caller sends `createIssue: true` (ADR 0014).
- The delegated call is sent with `User-Agent: asynchrone-api (token
  asy_xxxxxxxx)`, so the target app's audit row names the token in its
  `userAgent` column next to the owner as actor. Neither the delegated context
  nor any domain app changes for this.
- The contract is published as OpenAPI 3.1, generated from the route zod
  schemas and checked by a unit test.

### CLI

`@workspace/cli` (`packages/cli`, binary `asynchrone`) is a plain HTTP client:
it imports no service and no database package. Configuration precedence:
`--token`, `ASYNCHRONE_TOKEN`, `~/.config/asynchrone/config.json` (mode 0600);
the server is set with `ASYNCHRONE_API_URL`.

## Consequences

- One place verifies tokens, enforces `apiAccess` and limits requests; the
  domain apps keep owning their rules, identifiers and audit rows.
- An API request costs one extra hop (Copilot → domain app), the same as an
  MCP tool call.
- `lastUsedAt` is written at most once a minute per token to avoid a write per
  request.
- Out of scope for now: browser device-flow login for the CLI (a token is
  pasted), an owner-configurable maximum lifetime, organization-wide service
  accounts, webhooks and the other modules (#96).
