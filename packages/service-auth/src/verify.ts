import {
  SERVICE_SCOPES,
  ServiceTokenClaimsSchema,
  hasScope,
  type ServiceScope,
  type ServiceTokenClaims,
} from "@workspace/contracts"
import { createRemoteJWKSet, jwtVerify } from "jose"

import { ensureIssuer, serviceEndpoint, ServiceAuthError } from "./config"

type VerificationKey = Parameters<typeof jwtVerify>[1]

export interface ServiceTokenVerifierConfig {
  /** Copilot origin. */
  issuer: string
  /** This app's audience. */
  audience: string
  /** Optional local key set for tests; defaults to Copilot's JWKS. */
  keySet?: VerificationKey
  /** Override the JWKS URL; defaults to `{issuer}/api/auth/jwks`. */
  jwksUri?: string
}

export interface VerifyOptions {
  requiredScopes?: readonly ServiceScope[]
}

/**
 * Verify an internal service token. Checks signature, issuer, audience, expiry,
 * required claims and scopes. A token minted for another app is rejected.
 */
export class ServiceTokenVerifier {
  readonly issuer: string
  readonly audience: string
  private readonly keySet: VerificationKey
  private readonly acceptedIssuers: string[]

  constructor(config: ServiceTokenVerifierConfig) {
    this.issuer = ensureIssuer(config.issuer)
    this.audience = config.audience
    // Better Auth's OAuth provider stamps `iss` as `{origin}/api/auth`; older
    // tokens and the package tests use the bare origin. Accept both.
    this.acceptedIssuers = [this.issuer, `${this.issuer}/api/auth`]
    this.keySet =
      config.keySet ??
      createRemoteJWKSet(
        new URL(config.jwksUri ?? serviceEndpoint(this.issuer, "/jwks"))
      )
  }

  async verify(
    token: string,
    { requiredScopes = [] }: VerifyOptions = {}
  ): Promise<ServiceTokenClaims> {
    let payload: unknown
    try {
      const result = await jwtVerify(token, this.keySet, {
        issuer: this.acceptedIssuers,
        audience: this.audience,
      })
      payload = result.payload
    } catch (error) {
      throw new ServiceAuthError(
        "invalid_token",
        error instanceof Error ? error.message : "Service token is invalid",
        401
      )
    }

    const claims = ServiceTokenClaimsSchema.safeParse(payload)
    if (!claims.success) {
      throw new ServiceAuthError(
        "invalid_claims",
        "Service token claims are incomplete",
        401
      )
    }

    for (const scope of requiredScopes) {
      if (!hasScope(claims.data, scope)) {
        throw new ServiceAuthError(
          "insufficient_scope",
          `Service token is missing ${scope}`,
          403
        )
      }
    }

    return claims.data
  }
}

/**
 * Read a Bearer token from a Request and verify it. Use this at the top of an
 * `/internal/*` handler; it throws a typed error the handler can map to a
 * response.
 */
export async function requireInternalService(
  request: Request,
  verifier: ServiceTokenVerifier,
  options: VerifyOptions = {}
): Promise<ServiceTokenClaims> {
  const header = request.headers.get("authorization")
  if (!header?.toLowerCase().startsWith("bearer ")) {
    throw new ServiceAuthError(
      "missing_token",
      "A Bearer service token is required",
      401
    )
  }
  const token = header.slice("Bearer ".length).trim()
  if (!token) {
    throw new ServiceAuthError("missing_token", "Service token is empty", 401)
  }
  return verifier.verify(token, options)
}

export { SERVICE_SCOPES }
export type { ServiceScope, ServiceTokenClaims }
