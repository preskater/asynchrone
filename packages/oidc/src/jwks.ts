import { createRemoteJWKSet, jwtVerify } from "jose"

import {
  ensureOrigin,
  normalizeConfig,
  OIDC_BASE_PATH,
  oidcEndpoint,
  type OidcConfig,
} from "./config"

export interface AccessTokenClaims {
  sub: string
  sid?: string
  org?: string
  organizationId?: string
  org_slug?: string
  role?: string
  plan?: string
  scope?: string
  /** Organization policy captured when the token was issued. */
  twoFactorRequired?: boolean
  /** Whether the user had TOTP enrolled when the token was issued. */
  twoFactorEnrolled?: boolean
  /**
   * Whether the Copilot session was opened by platform staff. Present only
   * when the authorization server can attest it.
   */
  impersonated?: boolean
  /** OIDC authentication context class reference. */
  acr?: string
  /** OIDC authentication methods reference. */
  amr?: string[]
  iss?: string
  aud?: string | string[]
  exp?: number
  iat?: number
  [claim: string]: unknown
}

export interface LogoutTokenClaims {
  sid?: string
  sub?: string
  iss: string
  aud: string | string[]
}

type VerificationKey = Parameters<typeof jwtVerify>[1]

export interface VerifyTokenOptions {
  /** Local key set for tests; defaults to Copilot's cached JWKS. */
  keySet?: VerificationKey
  /** Override the configured clock skew, in seconds. */
  clockToleranceSeconds?: number
}

const BACKCHANNEL_LOGOUT_EVENT =
  "http://schemas.openid.net/event/backchannel-logout"

/**
 * One remote key set per JWKS URL.
 *
 * `createRemoteJWKSet` caches the fetched keys and refreshes them when an
 * unknown `kid` appears; building a new one for every verification threw that
 * cache away and made every request fetch Copilot's JWKS.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export function jwksUri(config: OidcConfig): string {
  return oidcEndpoint(ensureOrigin(config.issuer), "/jwks")
}

export function remoteJwks(
  config: OidcConfig
): ReturnType<typeof createRemoteJWKSet> {
  const uri = jwksUri(config)
  const cached = jwksCache.get(uri)
  if (cached) return cached
  const keySet = createRemoteJWKSet(new URL(uri))
  jwksCache.set(uri, keySet)
  return keySet
}

/**
 * The `iss` claim of every token the authorization server issues.
 *
 * Better Auth mounts the OAuth endpoints under `/api/auth` and uses that mount
 * as the issuer, while `OidcConfig.issuer` is the plain origin the endpoints
 * are built from. Token verification must expect the full issuer value.
 */
export function oidcIssuer(config: OidcConfig): string {
  return `${ensureOrigin(config.issuer)}${OIDC_BASE_PATH}`
}

export async function verifyAccessToken(
  config: OidcConfig,
  token: string,
  options: VerifyTokenOptions = {}
): Promise<AccessTokenClaims> {
  const normalized = normalizeConfig(config)
  const { payload } = await jwtVerify(
    token,
    options.keySet ?? remoteJwks(normalized),
    {
      issuer: oidcIssuer(normalized),
      audience: normalized.resource,
      clockTolerance:
        options.clockToleranceSeconds ?? normalized.clockToleranceSeconds,
    }
  )
  if (typeof payload.sub !== "string") {
    throw new Error("Access token has no subject")
  }
  return payload as AccessTokenClaims
}

/** Verify the ID token audience is the client, not the resource. */
export async function verifyIdToken(
  config: OidcConfig,
  token: string,
  options: VerifyTokenOptions = {}
): Promise<AccessTokenClaims> {
  const normalized = normalizeConfig(config)
  const { payload } = await jwtVerify(
    token,
    options.keySet ?? remoteJwks(normalized),
    {
      issuer: oidcIssuer(normalized),
      audience: normalized.clientId,
      clockTolerance:
        options.clockToleranceSeconds ?? normalized.clockToleranceSeconds,
    }
  )
  if (typeof payload.sub !== "string") {
    throw new Error("ID token has no subject")
  }
  return payload as AccessTokenClaims
}

/**
 * Verify a back-channel logout token. The `events` member must contain the
 * backchannel-logout event and the token must carry a `sid`.
 */
export async function verifyLogoutToken(
  config: OidcConfig,
  token: string,
  options: VerifyTokenOptions = {}
): Promise<LogoutTokenClaims> {
  const normalized = normalizeConfig(config)
  const { payload } = await jwtVerify(
    token,
    options.keySet ?? remoteJwks(normalized),
    {
      issuer: oidcIssuer(normalized),
      audience: normalized.clientId,
      clockTolerance:
        options.clockToleranceSeconds ?? normalized.clockToleranceSeconds,
    }
  )
  const events = payload.events
  if (
    typeof events !== "object" ||
    events === null ||
    !(BACKCHANNEL_LOGOUT_EVENT in events)
  ) {
    throw new Error("Logout token has no back-channel logout event")
  }
  if (typeof payload.sid !== "string") {
    throw new Error("Logout token has no session id")
  }
  return payload as LogoutTokenClaims
}

/** Organization id from either claim shape Copilot issues. */
export function claimOrganizationId(claims: AccessTokenClaims): string | null {
  if (typeof claims.org === "string") return claims.org
  if (typeof claims.organizationId === "string") return claims.organizationId
  return null
}

/**
 * The workspace 2FA gate. A token captured before a policy change must not
 * lower the requirement: callers combine this claim with the current
 * organization policy. Impersonating platform staff cannot enroll on the
 * user's behalf, so they are exempt.
 */
export function twoFactorRequiredByClaims(
  claims: AccessTokenClaims | null | undefined
): boolean {
  if (!claims) return false
  if (claims.impersonated === true) return false
  return claims.twoFactorRequired === true && claims.twoFactorEnrolled !== true
}
