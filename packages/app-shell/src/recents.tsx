"use client"

import * as React from "react"

export type AppKey = "projects" | "messages" | "calendars" | "files"

export interface RecentEntry {
  id: string
  label: string
  hint?: string
  at: number
  data?: Record<string, unknown>
}

type RecentsState = Record<AppKey, RecentEntry[]>

const STORAGE_PREFIX = "asynchrone-space.recents.v2"
const MAX_STORED = 5

const EMPTY: RecentsState = {
  projects: [],
  messages: [],
  calendars: [],
  files: [],
}

interface PersistedState {
  recents?: Partial<RecentsState>
  active?: Partial<Record<AppKey, string>>
}

function storageKey(organizationId?: string) {
  return organizationId ? `${STORAGE_PREFIX}.${organizationId}` : STORAGE_PREFIX
}

function readStored(key: string): PersistedState {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return {}
    return JSON.parse(raw) as PersistedState
  } catch {
    return {}
  }
}

function normalize(recents?: Partial<RecentsState>): RecentsState {
  return {
    projects: recents?.projects ?? [],
    messages: recents?.messages ?? [],
    calendars: recents?.calendars ?? [],
    files: recents?.files ?? [],
  }
}

interface RecentsStore {
  hydrated: boolean
  recents: RecentsState
  active: Partial<Record<AppKey, string>>
  list: (app: AppKey) => RecentEntry[]
  last: (app: AppKey) => RecentEntry | undefined
  record: (app: AppKey, entry: Omit<RecentEntry, "at">) => void
  setActive: (app: AppKey, id: string) => void
  clearApp: (app: AppKey) => void
  clearAll: () => void
}

const RecentsContext = React.createContext<RecentsStore | null>(null)

export function RecentsProvider({
  children,
  organizationId,
}: {
  children: React.ReactNode
  organizationId?: string
}) {
  const [recents, setRecents] = React.useState<RecentsState>(EMPTY)
  const [active, setActiveState] = React.useState<
    Partial<Record<AppKey, string>>
  >({})
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    const stored = readStored(storageKey(organizationId))
    setRecents(normalize(stored.recents))
    setActiveState(stored.active ?? {})
    setHydrated(true)
  }, [organizationId])

  React.useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(
        storageKey(organizationId),
        JSON.stringify({ recents, active })
      )
    } catch {
      // ignore storage failures
    }
  }, [recents, active, hydrated, organizationId])

  const store = React.useMemo<RecentsStore>(() => {
    return {
      hydrated,
      recents,
      active,
      list: (app) => recents[app],
      last: (app) => recents[app][0],
      record: (app, entry) => {
        setRecents((prev) => {
          const existing = prev[app].filter((item) => item.id !== entry.id)
          const next: RecentEntry = { ...entry, at: Date.now() }
          return {
            ...prev,
            [app]: [next, ...existing].slice(0, MAX_STORED),
          }
        })
        setActiveState((prev) => ({ ...prev, [app]: entry.id }))
      },
      setActive: (app, id) => {
        setActiveState((prev) => ({ ...prev, [app]: id }))
      },
      clearApp: (app) => {
        setRecents((prev) => ({ ...prev, [app]: [] }))
        setActiveState((prev) => {
          const next = { ...prev }
          delete next[app]
          return next
        })
      },
      clearAll: () => {
        setRecents(EMPTY)
        setActiveState({})
      },
    }
  }, [recents, active, hydrated])

  return (
    <RecentsContext.Provider value={store}>{children}</RecentsContext.Provider>
  )
}

export function useRecents() {
  const context = React.useContext(RecentsContext)
  if (!context) {
    throw new Error("useRecents must be used within a RecentsProvider")
  }
  return context
}
