"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { projectService } from "@/lib/projects"

/**
 * Task due dates for the calendar overlay.
 *
 * Calendars still live in Copilot until #161; this is the one project read the
 * Copilot shell keeps. Project *screens* and their actions moved to
 * `apps/projects` (#160) — this action goes away when calendars loads tasks
 * from the projects internal API.
 */
export const loadProjectTasksAction = withAction(async () => {
  const ctx = await getRequestContext()
  const { tasks } = await projectService.listWorkspace(ctx, {
    taskLimit: 500,
    activityLimit: 0,
  })
  return tasks
})
