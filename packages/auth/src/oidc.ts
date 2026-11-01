import {
  parseCookieHeader,
  resolveSession,
  sessionCookieName,
  type OidcConfig,
  type OidcSessionStore,
} from "@workspace/oidc"

export interface OidcSessionReaderOptions {
  store: OidcSessionStore
  config: OidcConfig
}

/**
 * Read a feature app's host-only OIDC session from its own cookie. Each domain
 * app stores the session row in its own database; this helper only resolves it
 * and refreshes the access token when needed. Copilot remains the issuer.
 */
export function createOidcSessionReader({
  store,
  config,
}: OidcSessionReaderOptions) {
  const cookieName = sessionCookieName(config)

  return {
    async resolve(cookieHeader: string | null) {
      const sessionId = parseCookieHeader(cookieHeader)[cookieName]
      if (!sessionId) return null
      return resolveSession(store, config, sessionId)
    },
  }
}
