import { MeetingRepository, MeetingService } from "@workspace/meetings"

import { notificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

/**
 * App adapter: meeting rules and the provider abstraction live in
 * `@workspace/meetings`; the web app binds the Prisma client and the inbox
 * notifier. Copilot's portal uses this instance in-process until #190 moves it
 * behind the calendars internal API.
 */
export const meetingRepository = new MeetingRepository(prisma)
export const meetingService = new MeetingService(
  meetingRepository,
  notificationService
)
