import type { RequestContext } from "@workspace/core/context"
import { primaryRole } from "@workspace/core/roles"

import {
  searchAcrossApps,
  type SearchFanoutResult,
  type SearchRemote,
} from "./fanout"
import { searchRemotes } from "./remotes"

export { searchAcrossApps } from "./fanout"
export type { SearchFanoutResult, SearchRemote } from "./fanout"

/**
 * Global search for the active workspace.
 *
 * Copilot owns the fan-out and the UI; every domain is a separate app searched
 * over HTTP through `SearchClient`. A configured app origin participates, and a
 * down app yields a partial result instead of failing the page.
 */
export async function searchWorkspace(
  ctx: RequestContext,
  orgSlug: string,
  query: string,
  options: { limit?: number; timeoutMs?: number; locale?: string } = {}
): Promise<SearchFanoutResult> {
  const remotes: SearchRemote[] = searchRemotes()
  return searchAcrossApps(ctx.organizationId, query, remotes, {
    ...options,
    organizationSlug: orgSlug,
    userId: ctx.userId,
    userName: ctx.userName,
    userEmail: ctx.userEmail,
    role: primaryRole(ctx.roles),
  })
}
