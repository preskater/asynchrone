# OAuth 2.1 authorization server

Copilot is the OAuth 2.1/OIDC authorization server for workspace apps
([ADR 0029](../adr/0029-use-copilot-as-oauth-authorization-server.md)). The
implementation lives in `apps/copilot/lib/auth.ts` and `apps/copilot/lib/oauth/`.

## Provider

`mcp()` from `@better-auth/mcp` **is** the OAuth provider for this Better Auth
instance. Do not register `oauthProvider()` alongside it. It provides:

- OIDC discovery, authorization-server metadata and UserInfo;
- authorization code + S256 PKCE, refresh and client credentials;
- `/oauth2/token`, `/oauth2/introspect`, `/oauth2/revoke` and
  `/oauth2/end-session`;
- per-resource token audiences and per-client resource links;
- consent and organization selection;
- RP-initiated and back-channel logout metadata.

MCP remains a protected resource at `MCP_RESOURCE_URL` (default
`${BETTER_AUTH_URL}/mcp`).

## Resources and scopes

`apps/copilot/lib/oauth/resources.ts` builds the provider resources from
`@workspace/contracts`:

| Resource                                                                                                    | Scopes                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `urn:asynchrone:app:projects`, `...:calendars`, `...:files`, `...:messages`, `...:clients`, `...:employees` | `openid`, `profile`, `email`, `offline_access`, `app:read`, `app:write`, plus the internal service scopes for machine callers                      |
| `urn:asynchrone:app:copilot`                                                                                | `internal:identity:*`, `internal:audit:*`, `internal:search:read`, `internal:notifications:write`, `internal:export:read`, `internal:delete:write` |
| `MCP_RESOURCE_URL`                                                                                          | `openid`, `profile`, `email`, `offline_access`, `projects`, `calendars`, `files`, `messaging`                                                      |

- The audience is a stable URN (`urn:asynchrone:app:<key>`), not the environment host. A token for projects is rejected by files.
- `app:read`/`app:write` are the user-delegated scopes; the target app still
  applies its own role, entitlement and portal rules.
- Dynamic MCP clients only receive the MCP resource. First-party app clients are
  provisioned with their own resource in #182.

## Tokens

- Access tokens: JWT, 15 minutes, audience-bound.
- Refresh tokens: 30 days, rotating, 30-second reuse window for retry safety.
- Claims added to the access token:
  - `organizationId`, `org`, `org_slug`, `organizationName`;
  - `role`, `plan`;
  - `userName`, `userEmail`;
  - `twoFactorRequired`, `twoFactorEnrolled`.
- OIDC reserved claims (`iss`, `sub`, `aud`, `exp`, `sid`, `amr`, `acr`, …) are
  owned by the provider. Do not try to overwrite them.

## 2FA and organization policy

Before `/oauth2/authorize` issues a code, the `before` hook:

1. resolves the session with `getSessionFromCtx`;
2. skips impersonated sessions;
3. loads the active organization policy and plan entitlement;
4. redirects an unenrolled member to
   `/two-factor/setup?next=<encoded authorize URL>`.

The setup page returns to `next` after enrollment, so the OAuth flow resumes.
The workspace layout keeps the same gate for direct page visits.

Known edge: if the user has no active organization, organization selection runs
through `/select-organization` after the hook. A policy check after that
selection is handled by the workspace gate and by the per-app token claims; #169
adds a stricter post-selection redirect.

## Revocation on context changes

- `/organization/set-active` revokes the user's OAuth refresh and access tokens;
  apps re-authorize for the new organization.
- A member role change revokes tokens before deleting sessions.
- `/sign-out` revokes grants bound to the ending session.
- Access tokens are short-lived JWTs, so revocation is effective at refresh or
  expiry; introspection reports an ended session as inactive.
- Back-channel logout URIs are registered per app client in #182.

## Environment

| Variable                                                    | Purpose                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `BETTER_AUTH_URL`                                           | Issuer and Copilot origin (`https://copilot.asynchrone.space` in production) |
| `MCP_RESOURCE_URL`                                          | MCP protected-resource identifier (`https://copilot.asynchrone.space/mcp`)  |
| `LANDING_APP_URL`, `COPILOT_APP_URL`, `PROJECTS_APP_URL`, … | App origins used to build OAuth resources                                |
| `OAUTH_TRUSTED_CLIENT_IDS`                                  | Comma-separated first-party client IDs that skip the client lookup cache |

There is **no `AUTH_COOKIE_DOMAIN`** and no shared customer cookie.

## Validation

```bash
npm run test:unit --workspace=copilot
npm run test:unit --workspace=@workspace/contracts
npm run typecheck
npm run lint
```

The claim builder is covered by `apps/copilot/lib/oauth/claims.unit.test.ts`; the
resource/scope matrix is covered by the contracts package.

## Follow-up

- #180 — OIDC client package and host-only app sessions.
- #181 — service-token verifier and cache.
- #182 — first-party client provisioning, secrets and back-channel URIs.
- #169 — stricter post-org-selection 2FA and full logout hardening.
