import {
  APPS,
  CUSTOMER_APP_KEYS,
  InvalidationClient,
} from "@workspace/contracts"
import { routing } from "@workspace/i18n/routing"
import { logJson } from "@workspace/observability"
import { ServiceTokenClient } from "@workspace/service-auth"

/**
 * Cross-app cache invalidation fan-out (issue #170, ADR 0038).
 *
 * `revalidatePath`/`revalidateTag` only clear the deployment that calls them.
 * Copilot is the workspace shell and the portal, so after a mutation it owns
 * it tells every customer app to revalidate the organization's paths too. The
 * calls are best-effort: a domain app that is down must not fail the user's
 * mutation, and the log line names the app that did not answer.
 */

let tokens: ServiceTokenClient | null = null

function tokenClient(): ServiceTokenClient | null {
  if (tokens) return tokens
  const issuer = process.env.COPILOT_APP_URL ?? process.env.BETTER_AUTH_URL
  const clientId = process.env.COPILOT_OAUTH_CLIENT_ID
  const clientSecret = process.env.COPILOT_OAUTH_CLIENT_SECRET
  if (!issuer || !clientId || !clientSecret) return null
  tokens = new ServiceTokenClient({ issuer, clientId, clientSecret })
  return tokens
}

function invalidationClients(): InvalidationClient[] {
  const service = tokenClient()
  if (!service) return []
  return CUSTOMER_APP_KEYS.flatMap((key) => {
    if (key === "copilot") return []
    const baseUrl = process.env[APPS[key].hostEnv]
    if (!baseUrl) return []
    return [
      new InvalidationClient({
        app: key,
        baseUrl,
        getToken: (request) => service.getToken(request),
      }),
    ]
  })
}

export interface InvalidateCachesInput {
  organizationId: string
  organizationSlug: string
  /** Organization-relative path, for example `/clients`. */
  path?: string
  tags?: string[]
  reason: string
  correlationId?: string | null
}

/**
 * Ask every reachable customer app to revalidate the organization's pages.
 *
 * Returns the per-app outcome for tests and logs; never throws.
 */
export async function invalidateDomainCaches({
  organizationId,
  organizationSlug,
  path = "",
  tags = [],
  reason,
  correlationId,
}: InvalidateCachesInput): Promise<
  { app: string; ok: boolean; error?: string }[]
> {
  const clients = invalidationClients()
  if (clients.length === 0) return []
  const paths = routing.locales.map(
    (locale) => `/${locale}/${organizationSlug}${path}`
  )
  const results = await Promise.all(
    clients.map(async (client) => {
      try {
        await client.invalidate({
          organizationId,
          organizationSlug,
          paths,
          tags,
          reason,
        })
        return { app: client.app, ok: true }
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : String(cause)
        logJson("warn", "cache.invalidation_failed", {
          app: client.app,
          organizationId,
          reason,
          correlationId: correlationId ?? undefined,
          error,
        })
        return { app: client.app, ok: false, error }
      }
    })
  )
  return results
}
