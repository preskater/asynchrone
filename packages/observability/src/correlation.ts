/**
 * Cross-app correlation ids (issue #170).
 *
 * One logical user action — a page load, a mutation that fans out to domain
 * apps, or a navigation that hops from Copilot to a domain host — should carry
 * one id through the logs of every app it touches. The transport is:
 *
 * - `x-request-id` on HTTP requests (set by the edge or by the caller);
 * - the same header on the response, so a browser or proxy can record it;
 * - `?rid=` on cross-app navigation, because every app keeps a host-only
 *   cookie and a cookie cannot cross a subdomain boundary (ADR 0018);
 * - a non-HttpOnly `asynchrone_rid` cookie so client code can read the id and
 *   append it to an external link.
 *
 * The id is never used for authorization.
 */

export const CORRELATION_HEADER = "x-request-id"
/** Response header used by the timing wrapper and the proxy. */
export const CORRELATION_RESPONSE_HEADER = "x-request-id"
/** Query parameter that carries the id across an app boundary. */
export const CORRELATION_QUERY_PARAM = "rid"
/** Host-only, non-HttpOnly cookie read by the client navigation helper. */
export const CORRELATION_COOKIE = "asynchrone_rid"

/** Ids are attacker-controllable; only accept a conservative character set. */
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/

export function isCorrelationId(value: unknown): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value)
}

/** Generate a new correlation id. */
export function newCorrelationId(): string {
  return crypto.randomUUID()
}

export interface CorrelationSources {
  header?: string | null
  query?: string | null
  cookie?: string | null
}

/**
 * Resolve the id for an inbound request: an explicit header wins, then the
 * cross-app query parameter, then this host's cookie, then a fresh id.
 */
export function resolveCorrelationId(sources: CorrelationSources): string {
  for (const candidate of [sources.header, sources.query, sources.cookie]) {
    const value = candidate?.trim()
    if (value && isCorrelationId(value)) return value
  }
  return newCorrelationId()
}

/**
 * Append the correlation id to a cross-app URL. Existing query parameters and
 * hash fragments are preserved, and an existing valid `rid` is kept.
 */
export function correlateUrl(url: string | URL, correlationId: string): string {
  if (!isCorrelationId(correlationId)) return String(url)
  const target = new URL(url, "http://localhost")
  if (target.searchParams.get(CORRELATION_QUERY_PARAM) === correlationId) {
    return String(url)
  }
  target.searchParams.set(CORRELATION_QUERY_PARAM, correlationId)
  const rendered = target.toString()
  // `new URL` with a base adds the placeholder origin for relative URLs.
  return url instanceof URL || /^[a-z][a-z0-9+.-]*:/i.test(String(url))
    ? rendered
    : rendered.replace(/^http:\/\/localhost/, "")
}

/** Read the correlation id the proxy stored for this browser tab. */
export function readCorrelationCookie(
  cookieHeader: string | null
): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name !== CORRELATION_COOKIE || rest.length === 0) continue
    const value = decodeURIComponent(rest.join("="))
    if (isCorrelationId(value)) return value
  }
  return null
}

/** Response headers that carry the id back to the caller. */
export function correlationHeaders(
  correlationId: string
): Record<string, string> {
  return isCorrelationId(correlationId)
    ? { [CORRELATION_RESPONSE_HEADER]: correlationId }
    : {}
}
