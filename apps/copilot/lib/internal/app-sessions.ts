import {
  CUSTOMER_APP_KEYS,
  SERVICE_SCOPES,
  internalAudience,
} from "@workspace/contracts"
import { appOrigin } from "@workspace/contracts/server"
import { ServiceTokenClient } from "@workspace/service-auth"

const DOMAIN_APPS = CUSTOMER_APP_KEYS.filter((key) => key !== "copilot")

const REVOKE_TIMEOUT_MS = 3_000

export interface RevokeAppSessionsOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * End the local session bound to a Copilot `sid` in every domain app.
 *
 * Copilot's back-channel logout already covers sign-out and stop-impersonation
 * when the session is deleted through Better Auth. Organization switching keeps
 * the Copilot session alive, so this targeted call makes the switch immediate
 * instead of waiting for the next refresh to fail.
 *
 * Every call is authenticated with a client-credentials token whose audience is
 * the target app (`internal:domain:write`). A token minted for another app is
 * rejected by that app's verifier. Failures are logged and never fail the
 * user's request: the app-side organization binding and impersonation TTL
 * remain the backstop.
 */
export async function revokeAppSessions(
  sid: string,
  {
    fetchImpl = fetch,
    timeoutMs = REVOKE_TIMEOUT_MS,
  }: RevokeAppSessionsOptions = {}
): Promise<void> {
  if (!sid) return

  const issuer = process.env.COPILOT_APP_URL ?? process.env.BETTER_AUTH_URL
  const clientId = process.env.COPILOT_OAUTH_CLIENT_ID
  const clientSecret = process.env.COPILOT_OAUTH_CLIENT_SECRET
  if (!issuer || !clientId || !clientSecret) {
    console.warn(
      "[oauth] COPILOT_OAUTH_CLIENT_ID/SECRET are not configured; skipping app session revocation"
    )
    return
  }

  const client = new ServiceTokenClient({
    issuer,
    clientId,
    clientSecret,
    fetchImpl,
  })

  const results = await Promise.allSettled(
    DOMAIN_APPS.map(async (key) => {
      const token = await client.getToken({
        audience: internalAudience(key),
        scopes: [SERVICE_SCOPES.domainWrite],
      })
      const response = await fetchImpl(
        `${appOrigin(key)}/internal/v1/auth/revoke`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ sid }),
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        }
      )
      if (!response.ok) {
        throw new Error(`${key} returned ${response.status}`)
      }
    })
  )

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      console.warn("[oauth] app session revocation failed", {
        app: DOMAIN_APPS[index],
        reason:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      })
    }
  }
}
