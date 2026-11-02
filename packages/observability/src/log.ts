/**
 * Structured request logs (issue #170).
 *
 * One JSON line per request keeps the fleet grep-able across nine stdout
 * streams: `correlationId` ties the Copilot shell, the domain internal call
 * and the domain app's own log line together. Never log a token, a cookie
 * value or a request body.
 */

export interface RequestLog {
  app: string
  route: string
  method: string
  status: number
  durationMs: number
  correlationId?: string | null
}

const REDACTED_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "token",
  "secret",
])

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        REDACTED_KEYS.has(key.toLowerCase()) ? "[redacted]" : sanitize(entry),
      ])
    )
  }
  return value
}

/** Emit one structured line. */
export function logJson(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown> = {}
): void {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(sanitize(fields) as Record<string, unknown>),
  })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

/** Log one completed request. */
export function logRequest(request: RequestLog): void {
  const level =
    request.status >= 500 ? "error" : request.status >= 400 ? "warn" : "info"
  logJson(level, "http.request", {
    app: request.app,
    route: request.route,
    method: request.method,
    status: request.status,
    durationMs: Math.round(request.durationMs * 100) / 100,
    correlationId: request.correlationId ?? undefined,
  })
}
