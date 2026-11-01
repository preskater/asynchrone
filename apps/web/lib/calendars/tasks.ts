import { isSameDay } from "@workspace/calendars/date-utils"
import type { Task } from "@/lib/projects/types"

/**
 * The date a task should appear on in the calendar. Tasks are shown on their
 * end date, falling back to the due date for tasks that only define one.
 */
export function taskCalendarDate(task: Task): Date | undefined {
  const value = task.endDate ?? task.dueDate
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function tasksOnDay(tasks: Task[], day: Date): Task[] {
  return tasks.filter((task) => {
    const date = taskCalendarDate(task)
    return date ? isSameDay(date, day) : false
  })
}
