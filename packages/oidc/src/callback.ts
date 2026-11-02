import { clearOAuthCookies, serializeSessionCookie } from "./cookies"
import type { OidcConfig } from "./config"
import { verifyAccessToken, type AccessTokenClaims } from "./jwks"
import { stateMatches } from "./pkce"
import {
  createSession,
  type OidcSessionRecord,
  type OidcSessionStore,
} from "./session"
import { exchangeAuthorizationCode, OidcError, type OidcFetch } from "./token"

export interface CompleteAuthorizationInput {
  code: string
  /** `state` returned by the authorization server. */
  state: string
  /** State stored in the caller's HttpOnly cookie. */
  expectedState: string
  /** PKCE verifier stored in the caller's HttpOnly cookie. */
  codeVerifier: string
  fetchImpl?: OidcFetch
  now?: number
  /** Injectable for tests; defaults to Copilot JWKS verification. */
  verify?: (token: string) => Promise<AccessTokenClaims>
}

export interface CompletedAuthorization {
  session: OidcSessionRecord
  /** Set-Cookie values: local session plus cleared OAuth state cookies. */
  setCookies: string[]
}

/**
 * Validate the callback, exchange the code, verify the access token and create
 * the app-local session. The caller writes the returned cookies with
 * `response.headers.append("Set-Cookie", ...)`.
 */
export async function completeAuthorization(
  config: OidcConfig,
  store: OidcSessionStore,
  {
    code,
    state,
    expectedState,
    codeVerifier,
    fetchImpl = fetch,
    now = Date.now(),
    verify = (token) => verifyAccessToken(config, token),
  }: CompleteAuthorizationInput
): Promise<CompletedAuthorization> {
  if (!stateMatches(expectedState, state)) {
    throw new OidcError("invalid_state", "The OAuth state does not match")
  }

  const tokens = await exchangeAuthorizationCode(config, {
    code,
    codeVerifier,
    fetchImpl,
    now,
  })
  const claims = await verify(tokens.access_token)
  const userId = claims.sub
  const sid = typeof claims.sid === "string" ? claims.sid : null
  const organizationId =
    typeof claims.org === "string"
      ? claims.org
      : typeof claims.organizationId === "string"
        ? claims.organizationId
        : null

  if (!sid) throw new OidcError("missing_sid", "Access token has no session id")
  if (!organizationId) {
    throw new OidcError("missing_org", "Access token has no organization")
  }

  const session = await createSession(store, {
    tokens,
    userId,
    organizationId,
    sid,
    now,
    claims,
  })

  return {
    session,
    setCookies: [
      serializeSessionCookie(config, session.id),
      ...clearOAuthCookies(config),
    ],
  }
}
