import { z } from "zod"

import {
  SERVICE_SCOPES,
  ServiceTokenClaimsSchema,
  type ServiceScope,
  type ServiceTokenClaims,
} from "./contracts"

export { SERVICE_SCOPES, ServiceTokenClaimsSchema }
export type { ServiceScope, ServiceTokenClaims }

/** Space-separated OAuth `scope` claim -> a set of scopes. */
export function scopeSet(scope: string): Set<string> {
  return new Set(scope.split(/\s+/).filter(Boolean))
}

export function hasScope(
  claims: ServiceTokenClaims,
  scope: ServiceScope
): boolean {
  return scopeSet(claims.scope).has(scope)
}

export function assertAudience(
  claims: ServiceTokenClaims,
  expected: string
): void {
  if (claims.aud !== expected) {
    throw new Error(`Service token audience mismatch: expected ${expected}`)
  }
}

/**
 * Parse and minimally validate a service token. Signature, issuer and expiry
 * verification belong to the HTTP verifier added in #181; this helper is the
 * shared shape check for handlers and tests.
 */
export function parseServiceTokenClaims(input: unknown): ServiceTokenClaims {
  return ServiceTokenClaimsSchema.parse(input)
}

const serviceScopeValues = Object.values(SERVICE_SCOPES)

export const serviceScopeSchema = z.custom<ServiceScope>(
  (value) =>
    typeof value === "string" &&
    serviceScopeValues.includes(value as ServiceScope),
  { message: "Unknown service scope" }
)

export const serviceAuthContract = z.object({
  scopes: z.array(serviceScopeSchema),
  audience: z.string().min(1),
})

/**
 * Request body for `POST /internal/v1/auth/revoke`: end every local app session
 * bound to one Copilot sign-in. Sent by Copilot on organization switch and as a
 * stop-impersonation backstop.
 */
export const SessionRevokeRequestSchema = z.object({
  sid: z.string().min(1),
})

export type SessionRevokeRequest = z.infer<typeof SessionRevokeRequestSchema>
