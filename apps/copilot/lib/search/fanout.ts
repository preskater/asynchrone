import type { SearchClient, SearchResult } from "@workspace/contracts"

export interface SearchRemote {
  app: string
  client: SearchClient
}

export interface SearchFanoutResult {
  results: SearchResult[]
  partial: boolean
  unavailableApps: { app: string; code: string; message: string }[]
}

function unavailable(app: string, cause: unknown) {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    "message" in cause
  ) {
    return {
      app,
      code: String((cause as { code: unknown }).code),
      message: String((cause as { message: unknown }).message),
    }
  }
  return {
    app,
    code:
      cause instanceof Error && cause.name === "TimeoutError"
        ? "timeout"
        : "unavailable",
    message: cause instanceof Error ? cause.message : "App unavailable",
  }
}

/**
 * Fan a global search out to every reachable domain app.
 *
 * Each app sees only its own database and applies its own organization,
 * visibility and portal rules. A slow app is aborted after `timeoutMs`; the
 * rest of the results still render with `partial: true`.
 */
export async function searchAcrossApps(
  organizationId: string,
  query: string,
  remotes: SearchRemote[],
  options: { limit?: number; timeoutMs?: number } = {}
): Promise<SearchFanoutResult> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
  const timeoutMs = options.timeoutMs ?? 2_000

  const results = await Promise.allSettled(
    remotes.map((remote) =>
      remote.client.search(
        organizationId,
        query,
        limit,
        AbortSignal.timeout(timeoutMs)
      )
    )
  )

  const merged: SearchResult[] = []
  const seen = new Set<string>()
  const unavailableApps: SearchFanoutResult["unavailableApps"] = []

  results.forEach((result, index) => {
    const remote = remotes[index]!
    if (result.status === "rejected") {
      unavailableApps.push(unavailable(remote.app, result.reason))
      return
    }
    for (const item of result.value.results) {
      const key = `${remote.app}:${item.type}:${item.id}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(item)
    }
  })

  return {
    results: merged.slice(0, limit),
    partial: unavailableApps.length > 0,
    unavailableApps,
  }
}
