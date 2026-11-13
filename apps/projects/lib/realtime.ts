import { createHub, publish } from "@workspace/realtime/server"

import { pool } from "@/lib/prisma"

/** The projects app's real-time hints (#98), on its own database. */
export const realtimeHub = createHub(pool)

export const TASK_COMMENTS_TOPIC = "task-comments"

export function publishTaskCommentChange(organizationId: string) {
  return publish(pool, { organizationId, topic: TASK_COMMENTS_TOPIC })
}
