import { MeetingRepository, MeetingService } from "@workspace/meetings"

import { createNotificationService } from "@/lib/notifications"
import { recordUserAudit } from "@/lib/audit"
import { identity } from "@/lib/identity"
import { prisma } from "@/lib/prisma"

/**
 * App adapter: meeting rules and the provider abstraction live in
 * `@workspace/meetings`; the calendars app binds the database client, the
 * identity directory and the notification ingress.
 */
export const meetingRepository = new MeetingRepository(prisma, {
  async listManagers(organizationId) {
    const members = await identity.listMembers(organizationId)
    return members
      .filter((member) => member.clientId == null)
      .map((member) => ({ userId: member.id, role: member.role }))
  },
  async findInternalMembers(organizationId, userIds) {
    const members = await identity.listMembers(organizationId)
    const wanted = new Set(userIds)
    return members
      .filter((member) => member.clientId == null && wanted.has(member.id))
      .map((member) => ({ userId: member.id }))
  },
})
export const meetingService = new MeetingService(
  meetingRepository,
  createNotificationService(),
  (ctx, input) => recordUserAudit(ctx, input)
)
