import { cookies } from "next/headers"

import { resolveSession, type OidcSessionRecord } from "@workspace/oidc"

import { oidcConfig, sessionCookieName, sessionStore } from "@/lib/oidc"

/**
 * Read and refresh the app-local session.
 *
 * The cookie holds the local session id, never a Copilot token. `resolveSession`
 * refreshes an expiring access token and deletes the row when the refresh
 * fails, so a revoked Copilot grant signs the user out here too.
 */
export async function readSessionRecord(): Promise<OidcSessionRecord | null> {
  const jar = await cookies()
  const id = jar.get(sessionCookieName)?.value
  if (!id) return null
  return resolveSession(sessionStore, oidcConfig, id)
}

/**
 * Delete every local session of a Copilot sign-in. Only call from a route
 * handler or server action: server components cannot write cookies.
 */
export async function deleteSessionsForSid(sid: string): Promise<void> {
  await sessionStore.deleteBySid(sid)
}
