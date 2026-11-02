import { internalAudience, type AppKey } from "../apps"
import {
  INTERNAL_ROUTES,
  InternalErrorSchema,
  SERVICE_SCOPES,
  SearchResponseSchema,
  type SearchResponse,
} from "../internal/contracts"

/** Typed client for one domain app's internal search endpoint. */
export interface SearchClientOptions {
  app: AppKey
  baseUrl: string
  getToken: (request: { audience: string; scopes: string[] }) => Promise<string>
  fetchImpl?: typeof fetch
}

export class SearchClientError extends Error {
  readonly status: number
  readonly code: string

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = "SearchClientError"
    this.code = code
    this.status = status
  }
}

export class SearchClient {
  private readonly options: SearchClientOptions
  private readonly audience: string

  constructor(options: SearchClientOptions) {
    this.options = { fetchImpl: fetch, ...options }
    this.audience = internalAudience(options.app)
  }

  async search(
    organizationId: string,
    query: string,
    limit = 20,
    signal?: AbortSignal,
    context: {
      organizationSlug?: string
      locale?: string
      userId?: string
      userName?: string
      userEmail?: string
      role?: string
    } = {}
  ): Promise<SearchResponse> {
    const search = new URLSearchParams({
      organizationId,
      q: query,
      limit: String(limit),
    })
    if (context.organizationSlug) {
      search.set("organizationSlug", context.organizationSlug)
    }
    if (context.locale) search.set("locale", context.locale)
    if (context.userId) search.set("userId", context.userId)
    if (context.userName) search.set("userName", context.userName)
    if (context.userEmail) search.set("userEmail", context.userEmail)
    if (context.role) search.set("role", context.role)
    const response = await (this.options.fetchImpl ?? fetch)(
      new URL(`${INTERNAL_ROUTES.search}?${search}`, this.options.baseUrl),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${await this.options.getToken({
            audience: this.audience,
            scopes: [SERVICE_SCOPES.searchRead],
          })}`,
        },
        cache: "no-store",
        signal,
      }
    )
    const body = (await response.json().catch(() => null)) as unknown
    if (!response.ok) {
      const parsed = InternalErrorSchema.safeParse(
        typeof body === "object" && body && "error" in body
          ? (body as { error: unknown }).error
          : body
      )
      throw new SearchClientError(
        parsed.success ? parsed.data.code : "search_request_failed",
        parsed.success
          ? parsed.data.message
          : `Search API returned ${response.status}`,
        response.status
      )
    }
    if (!body || typeof body !== "object" || !("data" in body)) {
      throw new SearchClientError(
        "invalid_response",
        "Search API response has no data",
        502
      )
    }
    return SearchResponseSchema.parse((body as { data: unknown }).data)
  }
}
