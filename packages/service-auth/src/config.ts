export interface ServiceAuthConfig {
  /** Copilot origin, e.g. `https://copilot.asynchrone.space`. Tokens carry `${origin}/api/auth` as `iss`. */
  issuer: string
  clientId: string
  clientSecret: string
  fetchImpl?: typeof fetch
}

export interface ServiceTokenRequest {
  /** Target app audience, `urn:asynchrone:app:<key>`. */
  audience: string
  scopes: readonly string[]
}

export class ServiceAuthError extends Error {
  readonly status: number
  readonly code: string

  constructor(code: string, message: string, status = 401) {
    super(message)
    this.name = "ServiceAuthError"
    this.code = code
    this.status = status
  }
}

export function ensureIssuer(issuer: string): string {
  const url = new URL(issuer)
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Service auth issuer must be an origin without a path")
  }
  return url.origin
}

/**
 * The `iss` claim on client-credentials tokens. Better Auth mounts the OAuth
 * endpoints under `/api/auth` and publishes that mount as its issuer, while
 * configuration carries the bare origin used to build endpoints.
 */
export function serviceIssuer(issuer: string): string {
  return `${ensureIssuer(issuer)}/api/auth`
}

export function serviceEndpoint(issuer: string, path: string): string {
  return new URL(`/api/auth${path}`, ensureIssuer(issuer)).toString()
}
