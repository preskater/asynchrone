import { createRemoteJWKSet, jwtVerify } from "jose"

import {
  ensureOrigin,
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
  [claim: string]: unknown
}

export interface LogoutTokenClaims {
  sid?: string
  sub?: string
  iss: string
  aud: string | string[]
}

const BACKCHANNEL_LOGOUT_EVENT =
  "http://schemas.openid.net/event/backchannel-logout"

export function jwksUri(config: OidcConfig): string {
  return oidcEndpoint(ensureOrigin(config.issuer), "/jwks")
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

/**
 * Verify an access token against Copilot's JWKS. The issuer is the Copilot
 * origin and the audience is the app's own resource, so a token minted for
 * another app is rejected.
 */
export async function verifyAccessToken(
  config: OidcConfig,
  token: string
): Promise<AccessTokenClaims> {
  const jwks = createRemoteJWKSet(new URL(jwksUri(config)))
  const { payload } = await jwtVerify(token, jwks, {
    issuer: oidcIssuer(config),
    audience: config.resource,
  })
  if (typeof payload.sub !== "string") {
    throw new Error("Access token has no subject")
  }
  return payload as AccessTokenClaims
}

/** Verify the ID token audience is the client, not the resource. */
export async function verifyIdToken(
  config: OidcConfig,
  token: string
): Promise<AccessTokenClaims> {
  const jwks = createRemoteJWKSet(new URL(jwksUri(config)))
  const { payload } = await jwtVerify(token, jwks, {
    issuer: oidcIssuer(config),
    audience: config.clientId,
  })
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
  token: string
): Promise<LogoutTokenClaims> {
  const jwks = createRemoteJWKSet(new URL(jwksUri(config)))
  const { payload } = await jwtVerify(token, jwks, {
    issuer: oidcIssuer(config),
    audience: config.clientId,
  })
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
