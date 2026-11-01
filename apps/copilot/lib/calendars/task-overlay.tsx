"use client"

import * as React from "react"

import { unwrapActionResult } from "@workspace/core/action"
import type { Task } from "@workspace/projects/types"

import { loadProjectTasksAction } from "@/actions/project-tasks"

/**
 * Task due dates for the calendar overlay.
 *
 * The Copilot shell no longer mounts the projects store; calendars (still a
 * Copilot domain until #161) loads the bounded task list it draws here, once,
 * when the user turns task chips on.
 */
interface CalendarTasksStore {
  tasks: Task[]
  ensureTasksLoaded: () => void
}

const CalendarTasksContext = React.createContext<CalendarTasksStore | null>(
  null
)

export function CalendarTasksProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [tasks, setTasks] = React.useState<Task[]>([])
  const loadedRef = React.useRef(false)

  const ensureTasksLoaded = React.useCallback(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void loadProjectTasksAction()
      .then((result) => setTasks(unwrapActionResult(result)))
      .catch(() => {
        loadedRef.current = false
        setTasks([])
      })
  }, [])

  const store = React.useMemo<CalendarTasksStore>(
    () => ({ tasks, ensureTasksLoaded }),
    [tasks, ensureTasksLoaded]
  )

  return (
    <CalendarTasksContext.Provider value={store}>
      {children}
    </CalendarTasksContext.Provider>
  )
}

export function useCalendarTasks(): CalendarTasksStore {
  const context = React.useContext(CalendarTasksContext)
  if (!context) {
    throw new Error(
      "useCalendarTasks must be used within a CalendarTasksProvider"
    )
  }
  return context
}
