import { internalAudience, SERVICE_SCOPES } from "@workspace/contracts"
import { appOAuthResources, appOAuthScopes } from "@workspace/contracts/server"

/**
 * OAuth resource and scope configuration shared by the provider and the app
 * registry. MCP keeps its own domain scopes; first-party apps use the narrower
 * `app:read` / `app:write` pair.
 */

export const MCP_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "projects",
  "calendars",
  "files",
  "messaging",
] as const

export const MCP_RESOURCE =
  process.env.MCP_RESOURCE_URL || `${process.env.BETTER_AUTH_URL}/mcp`

export function oauthResources() {
  return [
    ...appOAuthResources(),
    {
      identifier: internalAudience("copilot"),
      allowedScopes: Object.values(SERVICE_SCOPES),
    },
    { identifier: MCP_RESOURCE, allowedScopes: [...MCP_SCOPES] },
  ]
}

export function oauthScopes(): string[] {
  return [
    ...new Set([
      ...appOAuthScopes(),
      ...Object.values(SERVICE_SCOPES),
      ...MCP_SCOPES,
    ]),
  ]
}

/** Static first-party client IDs that can skip the DB lookup. */
export function trustedClientIds(): Set<string> {
  return new Set(
    (process.env.OAUTH_TRUSTED_CLIENT_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )
}

/** Access tokens are deliberately short; refresh tokens rotate. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
export const REFRESH_TOKEN_REUSE_SECONDS = 30
