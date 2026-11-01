/**
 * Storage helpers for the per-organization recents shelf.
 *
 * Kept React-free so the cross-domain contract suite can assert the storage
 * key and bucket rules without loading a client component.
 */

export type AppKey = "projects" | "messages" | "calendars" | "files"

export interface RecentEntry {
  id: string
  label: string
  hint?: string
  at: number
  data?: Record<string, unknown>
}

export type RecentsState = Record<AppKey, RecentEntry[]>

const STORAGE_PREFIX = "asynchrone-space.recents.v2"
export const RECENTS_MAX_STORED = 5

/**
 * Recents are stored per organization: switching workspaces must never show
 * another organization's recent entries.
 */
export function recentsStorageKey(organizationId?: string) {
  return organizationId ? `${STORAGE_PREFIX}.${organizationId}` : STORAGE_PREFIX
}

export function normalizeRecents(
  recents?: Partial<RecentsState>
): RecentsState {
  return {
    projects: recents?.projects ?? [],
    messages: recents?.messages ?? [],
    calendars: recents?.calendars ?? [],
    files: recents?.files ?? [],
  }
}

export const EMPTY_RECENTS: RecentsState = normalizeRecents()
