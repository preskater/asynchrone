import { MeetingRepository, MeetingService } from "@workspace/meetings"

import { createNotificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

/**
 * App adapter: meeting rules and the provider abstraction live in
 * `@workspace/meetings`; the calendars app binds the database client and the
 * inbox notifier. Copilot keeps its own instance for the portal and MCP tools
 * until #190 moves those reads behind the calendars internal API.
 */
export const meetingRepository = new MeetingRepository(prisma)
export const meetingService = new MeetingService(
  meetingRepository,
  createNotificationService(prisma)
)
