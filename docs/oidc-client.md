# OIDC client package

`@workspace/oidc` is the shared relying-party implementation for every workspace
app. It implements the browser-side and server-side halves of the code flow
against Copilot ([ADR 0029](../adr/0029-use-copilot-as-oauth-authorization-server.md)).

Do not hand-roll an OAuth client in an app. The package keeps the security
details (PKCE, state, cookie flags, token refresh, JWKS, back-channel logout)
in one place.

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
`sid` and organization claims, and creates the local session.

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

`resolveSession` returns a valid session or refreshes an expiring one. A failed
refresh deletes the local session; the caller redirects to Copilot.

- Secure mode uses `__Host-asynchrone_session` (Secure, Path=/, HttpOnly,
  SameSite=Lax, no Domain).
- Local HTTP uses `asynchrone_session` without the `__Host-` prefix.
- There is no shared `.copilot` cookie.

## Logout

- `handleBackChannelLogout(config, store, logoutToken)` verifies Copilot's
  logout token and deletes every local session with the same `sid`.
- `buildEndSessionUrl(config, { idToken, postLogoutRedirectUri, state })`
  starts RP-initiated logout.

## Organization switching

The token is bound to one organization, so switching is a new authorization, not
a session mutation. `apps/projects/app/api/auth/switch/route.ts` sends the
browser to Copilot's `/{locale}/select-organization?redirectTo=<app>/api/auth/sign-in?returnTo=…`;
Copilot updates the session's active organization and returns into the app's
sign-in flow. Copilot only accepts a registered customer origin and only its
`/api/auth/sign-in` path as the return target.

## Verification

```bash
npm run test:unit --workspace=@workspace/oidc
npm run typecheck --workspace=@workspace/oidc
npm run lint --workspace=@workspace/oidc
```

The package is covered by 33 tests: PKCE, authorization URL, cookie flags,
token exchange/refresh, session refresh/failure, callback state and claims,
back-channel logout, the token issuer, and the Prisma session store.

## Follow-up

- #182 registers the client, redirect URIs, secrets and back-channel logout URI.
- #160 binds the store in `apps/projects`, #162 in `apps/messages`; #161 and
  #163–#164 do the same per app.
- #169 adds the full logout and token-revocation hardening at the fleet level.
