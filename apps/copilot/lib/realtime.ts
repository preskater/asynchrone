import { createHub, publish } from "@workspace/realtime/server"

import { pool } from "@/lib/prisma"

/** Copilot's real-time hints (#98), on the identity database. */
export const realtimeHub = createHub(pool)

export const NOTIFICATIONS_TOPIC = "notifications"

/** Tell one user's open tabs that their notification inbox changed. */
export function publishNotificationChange(
  organizationId: string,
  userId: string
) {
  return publish(pool, { organizationId, userId, topic: NOTIFICATIONS_TOPIC })
}
