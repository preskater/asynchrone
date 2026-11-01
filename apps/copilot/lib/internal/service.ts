import { internalAudience, type ServiceScope } from "@workspace/contracts"
import {
  ServiceTokenVerifier,
  requireInternalService,
} from "@workspace/service-auth"

/** The Copilot service verifier, shared by the internal routes. */
export function copilotServiceVerifier(): ServiceTokenVerifier {
  const issuer = process.env.COPILOT_APP_URL ?? process.env.BETTER_AUTH_URL
  if (!issuer) {
    throw new Error("COPILOT_APP_URL or BETTER_AUTH_URL is required")
  }
  return new ServiceTokenVerifier({
    issuer,
    audience: internalAudience("copilot"),
  })
}

/** Verifies a client-credentials token and one required scope. */
export function requireCopilotService(
  request: Request,
  scope: ServiceScope
): Promise<unknown> {
  return requireInternalService(request, copilotServiceVerifier(), {
    requiredScopes: [scope],
  })
}
