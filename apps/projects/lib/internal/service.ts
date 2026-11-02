import { internalAudience, type ServiceScope } from "@workspace/contracts"
import {
  ServiceTokenVerifier,
  domainVerifier,
  requireInternalService,
} from "@workspace/service-auth"

import { env } from "@/lib/env"

/**
 * Verify an audience-bound client-credentials token for this app's
 * `/internal/v1/*` surface. A token minted for another app is rejected: the
 * verifier checks Copilot's signature, issuer, audience, expiry and scopes.
 *
 * The production path is the same `domainVerifier` the delegated domain API
 * uses (#190); the `keySet` override exists for the audience-isolation test.
 */
export function appServiceVerifier(
  options: {
    keySet?: ConstructorParameters<typeof ServiceTokenVerifier>[0]["keySet"]
  } = {}
): ServiceTokenVerifier {
  const audience = internalAudience("projects")
  if (!options.keySet) {
    return domainVerifier(audience, env.COPILOT_APP_URL)
  }
  return new ServiceTokenVerifier({
    issuer: env.COPILOT_APP_URL,
    audience,
    keySet: options.keySet,
  })
}

export function requireAppService(
  request: Request,
  scope: ServiceScope
): Promise<unknown> {
  return requireInternalService(request, appServiceVerifier(), {
    requiredScopes: [scope],
  })
}
