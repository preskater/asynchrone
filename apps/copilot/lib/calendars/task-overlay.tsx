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

const EMPTY_CALENDAR_TASKS: CalendarTasksStore = {
  tasks: [],
  ensureTasksLoaded: () => {},
}

export function useCalendarTasks(): CalendarTasksStore {
  // The Copilot shell no longer mounts the projects provider everywhere; the
  // mini calendar can render outside the calendars screen (for example in an
  // error boundary). Treat a missing provider as "no task overlay" instead of
  // crashing the whole route.
  return React.useContext(CalendarTasksContext) ?? EMPTY_CALENDAR_TASKS
}
