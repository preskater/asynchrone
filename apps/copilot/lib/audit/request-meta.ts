import { parseTrustedIpHeaders } from "@workspace/core/trusted-ip"

/**
 * Request metadata stored on every audit row. Security reviewers read the IP
 * and user agent next to the change, and both are useful when an account is
 * suspected of being shared.
 */
export interface RequestMeta {
  ipAddress: string | null
  userAgent: string | null
}

const MAX_IP_LENGTH = 64
const MAX_USER_AGENT_LENGTH = 512

export const EMPTY_REQUEST_META: RequestMeta = {
  ipAddress: null,
  userAgent: null,
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

/**
 * The client address from the first trusted header that carries one. Only
 * header names configured by `TRUSTED_IP_HEADERS` are read, so a direct client
 * cannot forge its address (see `lib/core/trusted-ip`).
 */
export function ipFromHeaders(
  source: Headers,
  trustedHeaders: string[] = parseTrustedIpHeaders(
    process.env.TRUSTED_IP_HEADERS
  )
): string | null {
  for (const name of trustedHeaders) {
    const raw = source.get(name)?.trim()
    if (!raw) continue
    // `X-Forwarded-For` is a hop list; the left-most entry is the client.
    const candidate = raw.split(",")[0]?.trim()
    if (candidate) return truncate(candidate, MAX_IP_LENGTH)
  }
  return null
}

/** Audit metadata derived from request headers. */
export function requestMetaFromHeaders(
  source: Headers,
  trustedHeaders: string[] = parseTrustedIpHeaders(
    process.env.TRUSTED_IP_HEADERS
  )
): RequestMeta {
  const userAgent = source.get("user-agent")?.trim()
  return {
    ipAddress: ipFromHeaders(source, trustedHeaders),
    userAgent: userAgent ? truncate(userAgent, MAX_USER_AGENT_LENGTH) : null,
  }
}
