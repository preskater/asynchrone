import type { RequestContext } from "@workspace/core/context"

import {
  searchAcrossApps,
  type SearchFanoutResult,
  type SearchRemote,
} from "./fanout"
import { inProcessSearchRemotes } from "./in-process"
import { searchRemotes } from "./remotes"

export { searchAcrossApps } from "./fanout"
export type { SearchFanoutResult, SearchRemote } from "./fanout"
export { inProcessSearchRemotes } from "./in-process"

/**
 * Global search for the active workspace.
 *
 * Copilot owns the fan-out and the UI. Each domain is either a separate app
 * (searched over HTTP through `SearchClient`) or still in process (searched
 * through its `@workspace/*` package). A configured app origin always wins, so
 * the split can move one domain at a time without changing the caller.
 */
export async function searchWorkspace(
  ctx: RequestContext,
  orgSlug: string,
  query: string,
  options: { limit?: number; timeoutMs?: number } = {}
): Promise<SearchFanoutResult> {
  const remote = searchRemotes()
  const remoteApps = new Set(remote.map((entry) => entry.app))
  const remotes: SearchRemote[] = [
    ...remote,
    ...inProcessSearchRemotes(ctx, orgSlug).filter(
      (entry) => !remoteApps.has(entry.app)
    ),
  ]

  return searchAcrossApps(ctx.organizationId, query, remotes, options)
}
