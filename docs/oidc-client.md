# OIDC client package

`@workspace/oidc` is the shared relying-party implementation for every workspace
app. It implements the browser-side and server-side halves of the code flow
against Copilot ([ADR 0029](../adr/0029-use-copilot-as-oauth-authorization-server.md)).

Do not hand-roll an OAuth client in an app. The package keeps the security
details (PKCE, state, cookie flags, token refresh, JWKS, back-channel logout,
clock skew, claim binding) in one place.

## Flow

```ts
import {
  MemorySessionStore,
  completeAuthorization,
  createAuthorizationRequest,
  readOAuthCookies,
  serializeOAuthCookies,
} from "@workspace/oidc"

const config = {
  issuer: "https://copilot.asynchrone.space",
  clientId: process.env.PROJECTS_OAUTH_CLIENT_ID!,
  clientSecret: process.env.PROJECTS_OAUTH_CLIENT_SECRET!,
  redirectUri: "https://projects.copilot.asynchrone.space/api/auth/callback",
  resource: "urn:asynchrone:app:projects",
}
```

### Start

1. `createAuthorizationRequest(config, { prompt: "none" })` returns the URL,
   state, PKCE verifier and nonce.
2. Write the state/verifier/nonce with `serializeOAuthCookies(config, values)`
   as short-lived HttpOnly cookies.
3. Redirect to `request.url`.

### Callback

1. Read the cookies with `readOAuthCookies(config, cookieHeader)`.
2. `completeAuthorization(config, store, { code, state, expectedState, codeVerifier })`.
3. Append `completed.setCookies` to the response. The package sets the local
   session cookie and clears the OAuth cookies.
4. The session row is stored by the app's `OidcSessionStore`.

`completeAuthorization` validates state, exchanges the code with client
authentication, verifies the access token against Copilot's JWKS, requires the
`sid` and organization claims, and creates the local session. The verified
claims are attached to the in-memory session record.

`OidcConfig.issuer` is the Copilot origin, but the tokens carry the value Better
Auth publishes in its discovery document: `${origin}/api/auth`. `oidcIssuer()`
computes it, and every verifier (`verifyAccessToken`, `verifyIdToken`,
`verifyLogoutToken`) compares against it. Compare against the bare origin and
every real token is rejected.

## Sessions

`OidcSessionRecord` stores the Copilot `sid`, user, organization and the
access/refresh tokens with their expiry. `OidcSessionStore` is the storage
contract; `MemorySessionStore` is for tests.

`PrismaOidcSessionStore` is the production adapter. It takes the app's Prisma
`oidcSession` delegate, so `@workspace/oidc` never imports a database package
and every app stores its sessions in its own database (see the model in
`packages/db/prisma/schema.prisma`):

```ts
import { PrismaOidcSessionStore } from "@workspace/oidc"

const store = new PrismaOidcSessionStore(prisma.oidcSession)
```

`apps/projects` is the reference binding (`apps/projects/lib/oidc.ts`) and
`apps/messages` follows it (`apps/messages/lib/oidc.ts`). Add the
`OidcSession` model to the app's schema (the split script shares it) and keep one
local session per Copilot `sid`: a new authorization for the same sign-in
replaces the previous row.

`resolveSession` loads the row, refreshes an expiring access token, then
verifies the current access token on **every** request:

- signature against Copilot's JWKS (one cached remote key set per JWKS URL, not
  one fetch per request);
- `iss` is `${origin}/api/auth` and `aud` is this app's
  `urn:asynchrone:app:<key>` resource, so a token minted for another app is
  rejected;
- `exp`/`nbf` with a 60-second clock-skew allowance
  (`OidcConfig.clockToleranceSeconds`);
- `sub`, `sid` and `org`/`organizationId` match the stored row.

A failed refresh, an invalid token, or a token bound to another user, sign-in
or organization deletes the local session and returns `null`; the caller
redirects to Copilot. Verification fails closed: an unreachable JWKS does not
make a local session trusted.

The verified claims are available as `session.claims` for the current request.
The workspace gate combines the token's `twoFactorRequired` claim with the
current organization policy, so a token captured before a policy or organization
change cannot lower the requirement. Impersonating platform staff are exempt
because they cannot enroll on the user's behalf.

- Secure mode uses `__Host-asynchrone_session` (Secure, Path=/, HttpOnly,
  SameSite=Lax, no Domain).
- Local HTTP uses `asynchrone_session` without the `__Host-` prefix.
- There is no shared `.copilot` cookie (`verify:auth-config` fails the build if
  one appears).

## Impersonation

`impersonationExpired({ impersonatedBy, createdAt })` enforces the one-hour
impersonation TTL from the Copilot session's creation time, independent of the
app session or a refreshed token. Every app's workspace resolver uses it;
Copilot also caps the session `expiresAt` at the same TTL and stop-impersonation
deletes the session, which triggers back-channel logout.

## Logout

- `handleBackChannelLogout(config, store, logoutToken)` verifies Copilot's
  logout token and deletes every local session with the same `sid`. Every app
  exposes `POST /api/auth/backchannel-logout` and registers the URI on its OAuth
  client.
- `buildEndSessionUrl(config, { idToken, postLogoutRedirectUri, state })`
  starts RP-initiated logout.

## Organization switching

The token is bound to one organization, so switching is a new authorization, not
a session mutation. `apps/projects/app/api/auth/switch/route.ts` first deletes
the local session and clears its cookie, then sends the browser to Copilot's
`/{locale}/select-organization?redirectTo=<app>/api/auth/sign-in?returnTo=…`;
Copilot updates the session's active organization and returns into the app's
sign-in flow. Copilot only accepts a registered customer origin and only its
`/api/auth/sign-in` path as the return target.

Because the Copilot session stays alive, the `/organization/set-active` hook also
calls every domain app's `POST /internal/v1/auth/revoke` with the Copilot `sid`
(see [internal-service-auth](./internal-service-auth.md)). The app deletes every
local session for that `sid`, so a switch ends the other apps' sessions too.

## Verification

```bash
npm run test:unit --workspace=@workspace/oidc
npm run typecheck --workspace=@workspace/oidc
npm run lint --workspace=@workspace/oidc
```

The package covers PKCE, authorization URL, cookie flags, token
exchange/refresh, session refresh/failure, callback state and claims,
back-channel logout, audience/issuer/signature/expiry rejection, clock skew,
session claim binding, the impersonation TTL and the Prisma session store.
`apps/projects/e2e/projects.spec.ts` asserts the host-only cookie and that an
organization switch removes the previous app session.

## Follow-up

- #182 registers the client, redirect URIs, secrets and back-channel logout URI.
- #160 binds the store in `apps/projects`, #162 in `apps/messages`; #161 and
  #163–#164 do the same per app.
- #169 hardens the fleet: per-request verification, clock skew, switch
  revocation and the `verify:auth-config` fleet checks.
