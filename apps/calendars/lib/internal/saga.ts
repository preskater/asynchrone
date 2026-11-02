import type { DeletionResult } from "@workspace/contracts"

import { prisma } from "@/lib/prisma"

const APP = "calendars"
const DELETED = "deleted"

export async function deleteOrganization(
  organizationId: string
): Promise<DeletionResult> {
  const where = { organizationId }
  const deleted = await prisma.$transaction(async (tx) => {
    const attendees = await tx.eventAttendee.deleteMany({
      where: { event: where },
    })
    const slots = await tx.meetingSlot.deleteMany({
      where: { request: where },
    })
    const members = await tx.calendarMember.deleteMany({
      where: { calendar: where },
    })
    const events = await tx.calendarEvent.deleteMany({ where })
    const calendars = await tx.calendar.deleteMany({ where })
    const requests = await tx.meetingRequest.deleteMany({ where })
    const settings = await tx.meetingSettings.deleteMany({ where })
    const auditLog = await tx.auditLog.deleteMany({ where })
    return {
      eventAttendee: attendees.count,
      meetingSlot: slots.count,
      calendarMember: members.count,
      calendarEvent: events.count,
      calendar: calendars.count,
      meetingRequest: requests.count,
      meetingSettings: settings.count,
      auditLog: auditLog.count,
    }
  })
  return { app: APP, organizationId, deleted, completedAt: new Date() }
}

export async function deleteUser(
  userId: string,
  organizationId = ""
): Promise<DeletionResult> {
  const deleted = await prisma.$transaction(async (tx) => {
    const members = await tx.calendarMember.deleteMany({ where: { userId } })
    const attendees = await tx.eventAttendee.deleteMany({ where: { userId } })
    const events = await tx.calendarEvent.updateMany({
      where: { createdBy: userId },
      data: { createdBy: DELETED },
    })
    const requests = await tx.meetingRequest.updateMany({
      where: { requestedById: userId },
      data: { requestedById: DELETED },
    })
    const decisions = await tx.meetingRequest.updateMany({
      where: { decidedById: userId },
      data: { decidedById: DELETED },
    })
    return {
      calendarMember: members.count,
      eventAttendee: attendees.count,
      calendarEvent: events.count,
      meetingRequest: requests.count,
      meetingDecision: decisions.count,
    }
  })
  return {
    app: APP,
    organizationId,
    userId,
    deleted,
    completedAt: new Date(),
  }
}
