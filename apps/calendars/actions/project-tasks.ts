"use server"

import { withAction } from "@workspace/core/action"

import { projectService } from "@/lib/projects"
import { getRequestContext } from "@/lib/request-context"

/**
 * Task due dates for the calendar overlay.
 *
 * The calendar shows task chips on their due date. Until #190 exposes the
 * projects internal API, the calendars app reads the bounded task list through
 * the shared client (see `lib/prisma.ts` and `lib/projects/index.ts`) — the
 * same transitional gap the projects pilot records.
 */
export const loadProjectTasksAction = withAction(async () => {
  const ctx = await getRequestContext()
  const { tasks } = await projectService.listWorkspace(ctx, {
    taskLimit: 500,
    activityLimit: 0,
  })
  return tasks
})
