import {
  AUDIT_EXPORT_LIMIT,
  AUDIT_PAGE_SIZE,
  type AuditFilter,
  type AuditPageInput,
} from "./filters"
import { encodeAuditCursor } from "./reader"
import type {
  AuditEntryView,
  AuditFacets,
  AuditPage,
  AuditUnavailableApp,
} from "./types"
import type { AuditClient } from "@workspace/contracts"

/**
 * Copilot's audit fan-out.
 *
 * Every app owns its rows, so a page, the filter facets and an export are the
 * merge of one local read and one read per reachable domain app. Keyset
 * pagination stays per app: the composite cursor remembers where each app
 * stopped, and a slow or down app yields a partial result instead of failing
 * the whole trail.
 */

export interface LocalAuditSource {
  list(organizationId: string, input: AuditPageInput): Promise<AuditPage>
  facets(organizationId: string): Promise<AuditFacets>
  export(
    organizationId: string,
    filter: AuditFilter,
    limit: number
  ): Promise<{ entries: AuditEntryView[]; truncated: boolean }>
}

export interface RemoteAuditSource {
  app: string
  client: AuditClient
}

interface CompositeCursor {
  local: string | null
  apps: Record<string, string | null>
}

function limitOf(input: AuditPageInput): number {
  if (!input.limit || !Number.isFinite(input.limit) || input.limit < 1) {
    return AUDIT_PAGE_SIZE
  }
  return Math.min(Math.floor(input.limit), 100)
}

function decodeComposite(
  cursor: string | null | undefined,
  remotes: RemoteAuditSource[]
): CompositeCursor {
  const empty: CompositeCursor = {
    local: null,
    apps: Object.fromEntries(remotes.map((remote) => [remote.app, null])),
  }
  if (!cursor) return empty
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    )
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "local" in parsed &&
      "apps" in parsed
    ) {
      const value = parsed as {
        local?: unknown
        apps?: Record<string, unknown>
      }
      return {
        local: typeof value.local === "string" ? value.local : null,
        apps: Object.fromEntries(
          remotes.map((remote) => {
            const appCursor = value.apps?.[remote.app]
            return [
              remote.app,
              typeof appCursor === "string" ? appCursor : null,
            ]
          })
        ),
      }
    }
  } catch {
    // A legacy plain cursor means "local only"; fall through.
  }
  return { ...empty, local: cursor }
}

function encodeComposite(cursor: CompositeCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

function unavailable(app: string, cause: unknown): AuditUnavailableApp {
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
    code: "unavailable",
    message: cause instanceof Error ? cause.message : "App unavailable",
  }
}

function compareDesc(a: AuditEntryView, b: AuditEntryView): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
}

function compareAsc(a: AuditEntryView, b: AuditEntryView): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

export async function listAuditAcrossApps(
  organizationId: string,
  input: AuditPageInput,
  local: LocalAuditSource,
  remotes: RemoteAuditSource[]
): Promise<AuditPage> {
  if (remotes.length === 0) return local.list(organizationId, input)

  const cursors = decodeComposite(input.cursor, remotes)
  const limit = limitOf(input)
  const [localResult, ...remoteResults] = await Promise.allSettled([
    local.list(organizationId, { ...input, cursor: cursors.local }),
    ...remotes.map((remote) =>
      remote.client.list(organizationId, {
        ...input,
        cursor: cursors.apps[remote.app] ?? null,
      })
    ),
  ])

  const unavailableApps: AuditUnavailableApp[] = []
  const sources: Array<{
    app: string
    items: AuditEntryView[]
    nextCursor: string | null
    total: number
  }> = []

  if (localResult.status === "fulfilled") {
    sources.push({
      app: "copilot",
      items: localResult.value.items,
      nextCursor: localResult.value.nextCursor,
      total: localResult.value.total,
    })
  } else {
    unavailableApps.push(unavailable("copilot", localResult.reason))
  }

  remoteResults.forEach((result, index) => {
    const remote = remotes[index]!
    if (result.status === "fulfilled") {
      sources.push({
        app: remote.app,
        items: result.value.items,
        nextCursor: result.value.nextCursor,
        total: result.value.total,
      })
    } else {
      unavailableApps.push(unavailable(remote.app, result.reason))
    }
  })

  const tagged = sources.flatMap((source) =>
    source.items.map((item) => ({ app: source.app, item }))
  )
  tagged.sort((a, b) => compareDesc(a.item, b.item))
  const page = tagged.slice(0, limit)

  const nextApps: Record<string, string | null> = {}
  const moreApps = new Set<string>()
  const nextCursor = (app: string, previous: string | null): string | null => {
    const source = sources.find((candidate) => candidate.app === app)
    const included = page.filter((entry) => entry.app === app)
    if (included.length > 0) {
      if (
        source &&
        (included.length < source.items.length || source.nextCursor !== null)
      ) {
        moreApps.add(app)
      }
      return encodeAuditCursor(included[included.length - 1]!.item)
    }
    // Everything this app returned is older than the global cutoff, so it
    // cannot contribute to a later page either.
    if (source?.items.length) return null
    return source ? source.nextCursor : previous
  }

  nextApps.copilot = nextCursor("copilot", cursors.local)
  for (const remote of remotes) {
    nextApps[remote.app] = nextCursor(
      remote.app,
      cursors.apps[remote.app] ?? null
    )
  }

  return {
    items: page.map((entry) => entry.item),
    nextCursor:
      moreApps.size > 0
        ? encodeComposite({
            local: nextApps.copilot ?? null,
            apps: nextApps,
          })
        : null,
    total: sources.reduce((sum, source) => sum + source.total, 0),
    partial: unavailableApps.length > 0,
    ...(unavailableApps.length ? { unavailableApps } : {}),
  }
}

export async function facetsAcrossApps(
  organizationId: string,
  local: LocalAuditSource,
  remotes: RemoteAuditSource[],
  since?: Date
): Promise<AuditFacets> {
  if (remotes.length === 0) return local.facets(organizationId)

  const results = await Promise.allSettled([
    local.facets(organizationId),
    ...remotes.map((remote) =>
      remote.client.facets(organizationId, {
        since: since?.toISOString(),
      })
    ),
  ])
  const unavailableApps: AuditUnavailableApp[] = []
  const facets: AuditFacets[] = []

  results.forEach((result, index) => {
    const app = index === 0 ? "copilot" : remotes[index - 1]!.app
    if (result.status === "fulfilled") facets.push(result.value)
    else unavailableApps.push(unavailable(app, result.reason))
  })

  const actions = new Map<string, number>()
  const entityTypes = new Map<string, number>()
  const actors = new Map<string, string | null>()
  for (const facet of facets) {
    for (const option of facet.actions) {
      actions.set(option.value, (actions.get(option.value) ?? 0) + option.count)
    }
    for (const option of facet.entityTypes) {
      entityTypes.set(
        option.value,
        (entityTypes.get(option.value) ?? 0) + option.count
      )
    }
    for (const actor of facet.actors) {
      const current = actors.get(actor.id)
      if (current === undefined || (!current && actor.name)) {
        actors.set(actor.id, actor.name)
      }
    }
  }

  const top = (values: Map<string, number>, size: number) =>
    [...values]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, size)

  return {
    actions: top(actions, 40),
    entityTypes: top(entityTypes, 40),
    actors: [...actors].slice(0, 50).map(([id, name]) => ({ id, name })),
    partial: unavailableApps.length > 0,
    ...(unavailableApps.length ? { unavailableApps } : {}),
  }
}

export interface AuditPruneTarget {
  organizationId: string
  /** ISO timestamp; rows strictly before it are deleted. */
  before: string
}

export interface PruneAcrossAppsResult {
  organizations: number
  deleted: number
  capped: number
  unavailableApps: AuditUnavailableApp[]
}

/**
 * Send retention cutoffs to every reachable app. The identity app's own rows
 * are pruned by `pruneAuditLogs`; this function only fans out to the domain
 * apps. A failed app is reported, and the next run retries it.
 */
export async function pruneAuditAcrossApps(
  targets: AuditPruneTarget[],
  remotes: RemoteAuditSource[],
  options: { batchSize?: number; maxBatches?: number; chunkSize?: number } = {}
): Promise<PruneAcrossAppsResult> {
  const result: PruneAcrossAppsResult = {
    organizations: targets.length,
    deleted: 0,
    capped: 0,
    unavailableApps: [],
  }
  if (targets.length === 0 || remotes.length === 0) return result

  const chunkSize = options.chunkSize ?? 500
  for (const remote of remotes) {
    try {
      for (let index = 0; index < targets.length; index += chunkSize) {
        const response = await remote.client.prune({
          organizations: targets.slice(index, index + chunkSize),
          batchSize: options.batchSize,
          maxBatches: options.maxBatches,
        })
        result.deleted += response.deleted
        result.capped += response.capped
      }
    } catch (cause) {
      result.unavailableApps.push(unavailable(remote.app, cause))
    }
  }
  return result
}

export interface AuditExportRows {
  entries: AuditEntryView[]
  truncated: boolean
  partial?: boolean
  unavailableApps?: AuditUnavailableApp[]
}

export async function exportAuditAcrossApps(
  organizationId: string,
  filter: AuditFilter,
  local: LocalAuditSource,
  remotes: RemoteAuditSource[],
  limit = AUDIT_EXPORT_LIMIT
): Promise<AuditExportRows> {
  if (remotes.length === 0) {
    const result = await local.export(organizationId, filter, limit)
    return { ...result, partial: false }
  }

  const results = await Promise.allSettled([
    local.export(organizationId, filter, limit),
    ...remotes.map((remote) => remote.client.export(organizationId, filter)),
  ])
  const unavailableApps: AuditUnavailableApp[] = []
  const entries: AuditEntryView[] = []
  let truncated = false

  results.forEach((result, index) => {
    const app = index === 0 ? "copilot" : remotes[index - 1]!.app
    if (result.status === "fulfilled") {
      entries.push(...result.value.entries)
      if (result.value.truncated) truncated = true
    } else {
      unavailableApps.push(unavailable(app, result.reason))
    }
  })

  entries.sort(compareAsc)
  if (entries.length > limit) {
    entries.length = limit
    truncated = true
  }

  return {
    entries,
    truncated,
    partial: unavailableApps.length > 0,
    ...(unavailableApps.length ? { unavailableApps } : {}),
  }
}
