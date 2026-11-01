import { APPS, CUSTOMER_APP_KEYS, SearchClient } from "@workspace/contracts"
import { ServiceTokenClient } from "@workspace/service-auth"

export interface SearchRemote {
  app: string
  client: SearchClient
}

/**
 * Domain apps reachable for global search. Only apps with a configured origin
 * participate; Copilot has no domain database of its own to search here.
 */
export function searchRemotes(): SearchRemote[] {
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
        client: new SearchClient({
          app: key,
          baseUrl,
          getToken: (request) => tokens.getToken(request),
        }),
      },
    ]
  })
}
