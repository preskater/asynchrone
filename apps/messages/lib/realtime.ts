import { createHub, publish } from "@workspace/realtime/server"

import { pool } from "@/lib/prisma"

/** The messages app's real-time hints (#98), on its own database. */
export const realtimeHub = createHub(pool)

export const MESSAGING_TOPIC = "messaging"

export function publishMessagingChange(organizationId: string) {
  return publish(pool, { organizationId, topic: MESSAGING_TOPIC })
}
