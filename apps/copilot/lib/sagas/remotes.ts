import { APPS, CUSTOMER_APP_KEYS, SagaClient } from "@workspace/contracts"
import { ServiceTokenClient } from "@workspace/service-auth"

/** Domain apps reachable by the deletion/export sagas. */
export function sagaRemotes(): {
  apps: string[]
  clients: Record<string, SagaClient>
} {
  const issuer = process.env.COPILOT_APP_URL ?? process.env.BETTER_AUTH_URL
  const clientId = process.env.COPILOT_OAUTH_CLIENT_ID
  const clientSecret = process.env.COPILOT_OAUTH_CLIENT_SECRET
  if (!issuer || !clientId || !clientSecret) return { apps: [], clients: {} }

  const tokens = new ServiceTokenClient({
    issuer,
    clientId,
    clientSecret,
  })
  const apps: string[] = []
  const clients: Record<string, SagaClient> = {}

  for (const key of CUSTOMER_APP_KEYS) {
    if (key === "copilot") continue
    const definition = APPS[key]
    const baseUrl = process.env[definition.hostEnv]
    if (!baseUrl) continue
    apps.push(key)
    clients[key] = new SagaClient({
      app: key,
      baseUrl,
      getToken: (request) => tokens.getToken(request),
    })
  }

  return { apps, clients }
}
