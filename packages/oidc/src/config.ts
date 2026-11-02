import { APP_USER_SCOPES } from "@workspace/contracts"

/**
 * Runtime configuration for an OIDC relying party.
 *
 * `issuer` is the Copilot origin (`https://copilot.asynchrone.space`), not a
 * path. Better Auth mounts the OAuth endpoints under `/api/auth`.
 */
export interface OidcConfig {
  /** Authorization-server origin, e.g. `https://copilot.asynchrone.space`. */
  issuer: string
  clientId: string
  clientSecret: string
  /** Exact registered callback, e.g. `https://projects.../api/auth/callback`. */
  redirectUri: string
  /** Target app audience, e.g. `https://projects.copilot.asynchrone.space`. */
  resource: string
  /** Defaults to the first-party app scopes. */
  scopes?: readonly string[]
  /** Defaults to `__Host-asynchrone_session` in secure mode. */
  sessionCookieName?: string
  /** Set false only for local HTTP development. */
  secureCookies?: boolean
  /** Defaults to 30 days. */
  sessionMaxAgeSeconds?: number
  /**
   * Allowed clock difference when checking `exp`/`nbf`/`iat`, in seconds.
   * Defaults to 60 so a small skew between Copilot and an app replica does not
   * reject otherwise valid tokens.
   */
  clockToleranceSeconds?: number
}

export interface NormalizedOidcConfig extends OidcConfig {
  scopes: readonly string[]
  sessionCookieName: string
  secureCookies: boolean
  sessionMaxAgeSeconds: number
  clockToleranceSeconds: number
}

/** Default clock skew allowance for JWKS verification. */
export const DEFAULT_CLOCK_TOLERANCE_SECONDS = 60

export const OIDC_BASE_PATH = "/api/auth"

export const OIDC_ENDPOINTS = {
  authorize: "/oauth2/authorize",
  token: "/oauth2/token",
  userinfo: "/oauth2/userinfo",
  endSession: "/oauth2/end-session",
  jwks: "/jwks",
  discovery: "/.well-known/openid-configuration",
} as const

export function oidcEndpoint(issuer: string, endpoint: string): string {
  return new URL(
    `${OIDC_BASE_PATH}${endpoint}`,
    ensureOrigin(issuer)
  ).toString()
}

export function ensureOrigin(issuer: string): string {
  const url = new URL(issuer)
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("OIDC issuer must be an origin without a path")
  }
  return url.origin
}

export function normalizeConfig(config: OidcConfig): NormalizedOidcConfig {
  const secureCookies = config.secureCookies ?? true
  return {
    ...config,
    issuer: ensureOrigin(config.issuer),
    scopes: config.scopes ?? APP_USER_SCOPES,
    sessionCookieName:
      config.sessionCookieName ??
      (secureCookies ? "__Host-asynchrone_session" : "asynchrone_session"),
    secureCookies,
    sessionMaxAgeSeconds: config.sessionMaxAgeSeconds ?? 30 * 24 * 60 * 60,
    clockToleranceSeconds:
      config.clockToleranceSeconds ?? DEFAULT_CLOCK_TOLERANCE_SECONDS,
  }
}
