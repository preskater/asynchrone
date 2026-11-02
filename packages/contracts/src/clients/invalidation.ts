import { internalAudience, type AppKey } from "../apps"
import {
  INTERNAL_ROUTES,
  InternalErrorSchema,
  SERVICE_SCOPES,
} from "../internal/contracts"
import {
  InvalidateResponseSchema,
  type InvalidateRequest,
  type InvalidateResponse,
} from "../internal/invalidation"

/**
 * Typed client for one app's internal cache invalidation endpoint (issue #170).
 *
 * Copilot fans a mutation out to every customer app after changing a read
 * model another host renders. Invalidation is best-effort: a failing app must
 * not fail the user's mutation, so the caller logs and moves on. The response
 * says how many cached entries the target cleared.
 */

export interface InvalidationClientOptions {
  /** Target app, used as the service-token audience. */
  app: AppKey
  /** App origin, e.g. `https://projects.copilot.asynchrone.space`. */
  baseUrl: string
  getToken: (request: { audience: string; scopes: string[] }) => Promise<string>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class InvalidationClient {
  /** Target app key, also used in the fan-out log line. */
  readonly app: AppKey
  private readonly options: InvalidationClientOptions
  private readonly audience: string

  constructor(options: InvalidationClientOptions) {
    this.app = options.app
    this.options = { fetchImpl: fetch, timeoutMs: 2_000, ...options }
    this.audience = internalAudience(options.app)
  }

  async invalidate(request: InvalidateRequest): Promise<InvalidateResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs)
    try {
      const token = await this.options.getToken({
        audience: this.audience,
        scopes: [SERVICE_SCOPES.cacheWrite],
      })
      const response = await (this.options.fetchImpl ?? fetch)(
        new URL(INTERNAL_ROUTES.invalidate, this.options.baseUrl),
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(request),
          cache: "no-store",
          signal: controller.signal,
        }
      )
      const body = (await response.json().catch(() => null)) as unknown
      if (!response.ok) {
        const parsed = InternalErrorSchema.safeParse(
          typeof body === "object" && body && "error" in body
            ? (body as { error: unknown }).error
            : body
        )
        throw new Error(
          parsed.success
            ? `${this.options.app}: ${parsed.data.code} (${response.status})`
            : `${this.options.app}: invalidation returned ${response.status}`
        )
      }
      return InvalidateResponseSchema.parse(body)
    } finally {
      clearTimeout(timeout)
    }
  }
}
