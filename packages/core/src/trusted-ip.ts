/**
 * Headers whose client-IP value Better Auth may trust for per-IP rate limits
 * on the auth endpoints.
 *
 * They are only trustworthy behind a proxy that overwrites them: ingress-nginx
 * sets `X-Real-IP` to `$remote_addr` and appends the hop to
 * `X-Forwarded-For`. A directly exposed process (a bare `next start`, the
 * `docker compose` Copilot container, `kubectl port-forward`) lets a client pick
 * any value and dodge the limits, so production must never be reachable
 * without such a proxy. Kept dependency-free: `lib/env.ts` imports it at boot.
 */
export const DEFAULT_TRUSTED_IP_HEADERS = ["x-real-ip", "x-forwarded-for"]

/** Lowercased, trimmed, de-duplicated header list; defaults when unset/blank. */
export function parseTrustedIpHeaders(value: string | undefined): string[] {
  const raw = value?.trim() ? value : DEFAULT_TRUSTED_IP_HEADERS.join(",")
  return [
    ...new Set(
      raw
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
}

/** Configuration mistakes for `lib/env.ts` to refuse at boot. */
export function trustedIpHeaderProblems(value: string | undefined): string[] {
  if (value === undefined || value === "") return []
  const parts = value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
  if (parts.length === 0) {
    return ["TRUSTED_IP_HEADERS must list at least one header"]
  }

  const problems: string[] = []
  const invalid = parts.filter((part) => !/^[a-z0-9-]+$/.test(part))
  if (invalid.length > 0) {
    problems.push(
      `TRUSTED_IP_HEADERS has invalid header names: ${invalid.join(", ")}`
    )
  }
  const repeated = [...new Set(parts.filter((p, i) => parts.indexOf(p) !== i))]
  if (repeated.length > 0) {
    problems.push(`TRUSTED_IP_HEADERS repeats: ${repeated.join(", ")}`)
  }
  return problems
}
