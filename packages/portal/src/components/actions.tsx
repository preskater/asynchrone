"use client"

import * as React from "react"

import type { ActionResult } from "@workspace/core/action"
import type { CreateMeetingRequestInput } from "@workspace/meetings/schemas"
import type { MeetingRequestData } from "@workspace/meetings/types"
import type { ProjectMessageData } from "@workspace/projects/thread"
import type { TaskCommentData } from "@workspace/projects/task-comments"

/**
 * The server actions the portal screens call. Copilot passes its
 * `actions/portal.ts` and `actions/meetings.ts` exports; the portal has no app
 * of its own, so no component imports `@/actions/*` directly.
 */
export interface PortalActions {
  postPortalMessageAction(input: {
    projectId: string
    body: string
  }): Promise<ActionResult<ProjectMessageData>>
  postPortalTaskCommentAction(input: {
    projectId: string
    taskId: string
    body: string
  }): Promise<ActionResult<TaskCommentData>>
  markPortalSeenAction(): Promise<ActionResult<{ ok: boolean }>>
  createMeetingRequestAction(
    input: CreateMeetingRequestInput
  ): Promise<ActionResult<MeetingRequestData>>
  cancelMeetingRequestAction(input: {
    id: string
  }): Promise<ActionResult<MeetingRequestData>>
}

const PortalActionsContext = React.createContext<PortalActions | null>(null)

export function PortalActionsProvider({
  actions,
  children,
}: {
  actions: PortalActions
  children: React.ReactNode
}) {
  return (
    <PortalActionsContext.Provider value={actions}>
      {children}
    </PortalActionsContext.Provider>
  )
}

export function usePortalActions(): PortalActions {
  const actions = React.useContext(PortalActionsContext)
  if (!actions) {
    throw new Error(
      "usePortalActions must be used inside PortalActionsProvider"
    )
  }
  return actions
}
