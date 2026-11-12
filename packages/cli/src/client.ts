import { CliError, EXIT, exitCodeForStatus, hintFor } from "./errors.js"

export const CLI_VERSION = "0.1.0"

export interface ApiClientOptions {
  apiUrl: string
  token: string | null
  fetchImpl?: typeof fetch
}

/** Thin JSON client for `/api/v1`; every failure becomes a `CliError`. */
export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    init: { body?: unknown; idempotencyKey?: string } = {}
  ): Promise<T> {
    if (!this.options.token) {
      throw new CliError(
        "No API token. Pass --token, set ASYNCHRONE_TOKEN or run `asynchrone auth login --token …`.",
        EXIT.auth
      )
    }
    const fetchImpl = this.options.fetchImpl ?? fetch
    let response: Response
    try {
      response = await fetchImpl(`${this.options.apiUrl}/api/v1${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.options.token}`,
          "User-Agent": `asynchrone-cli/${CLI_VERSION}`,
          ...(init.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...(init.idempotencyKey
            ? { "Idempotency-Key": init.idempotencyKey }
            : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      })
    } catch (error) {
      throw new CliError(
        `Cannot reach ${this.options.apiUrl}: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: T
      error?: { code?: string; message?: string }
    } | null
    if (!response.ok) {
      const code = payload?.error?.code
      const message = payload?.error?.message ?? `HTTP ${response.status}`
      const hint = hintFor(code)
      const retry = response.headers.get("retry-after")
      throw new CliError(
        [
          `${message}${code ? ` (${code})` : ""}`,
          retry ? `Retry after ${retry}s.` : null,
          hint,
        ]
          .filter(Boolean)
          .join(" "),
        exitCodeForStatus(response.status),
        code
      )
    }
    return payload?.data as T
  }
}
