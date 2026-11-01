import { APPS, CUSTOMER_APP_KEYS, AuditClient } from "@workspace/contracts"
import { ServiceTokenClient } from "@workspace/service-auth"

import type { RemoteAuditSource } from "@workspace/audit"

/**
 * Reachable domain apps for the audit fan-out.
 *
 * A remote is enabled only when its origin is configured; the Copilot OAuth
 * client requests a token for that app's audience. In local development no
 * domain origin is set, so aggregation stays local without failing.
 */
export function auditRemotes(): RemoteAuditSource[] {
  const issuer = process.env.COPILOT_APP_URL ?? process.env.BETTER_AUTH_URL
  const clientId = process.env.COPILOT_OAUTH_CLIENT_ID
  const clientSecret = process.env.COPILOT_OAUTH_CLIENT_SECRET
  if (!issuer || !clientId || !clientSecret) return []

  const tokens = new ServiceTokenClient({
    issuer,
    clientId,
    clientSecret,
  })

  return CUSTOMER_APP_KEYS.flatMap((key) => {
    if (key === "copilot") return []
    const definition = APPS[key]
    const baseUrl = process.env[definition.hostEnv]
    if (!baseUrl) return []
    return [
      {
        app: key,
        client: new AuditClient({
          app: key,
          baseUrl,
          getToken: (request) => tokens.getToken(request),
        }),
      },
    ]
  })
}
