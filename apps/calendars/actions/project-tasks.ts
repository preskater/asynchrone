"use server"

import { z } from "zod"

import { withAction } from "@workspace/core/action"
import type { Task } from "@workspace/projects/types"

import { callDomain, delegatedContext } from "@/lib/internal/domain-client"
import { getRequestContext } from "@/lib/request-context"

/**
 * Task due dates for the calendar overlay.
 *
 * The projects app owns tasks; this read goes through its delegated internal
 * API, so no projects table is reachable from the calendars database.
 */
export const loadProjectTasksAction = withAction(async () => {
  const ctx = await getRequestContext()
  return callDomain(
    "projects",
    "list-calendar-tasks",
    delegatedContext(ctx),
    {},
    z.array(z.unknown())
  ) as Promise<Task[]>
})
