import { buildExportPart } from "@workspace/sagas"

import { prisma } from "@/lib/prisma"

export function exportOrganization(organizationId: string) {
  const where = { organizationId }
  return buildExportPart("calendars", {
    calendar: () => prisma.calendar.findMany({ where }),
    calendarMember: () =>
      prisma.calendarMember.findMany({ where: { calendar: where } }),
    calendarEvent: () => prisma.calendarEvent.findMany({ where }),
    eventAttendee: () =>
      prisma.eventAttendee.findMany({ where: { event: where } }),
    meetingSettings: () => prisma.meetingSettings.findMany({ where }),
    meetingRequest: () => prisma.meetingRequest.findMany({ where }),
    meetingSlot: () =>
      prisma.meetingSlot.findMany({ where: { request: where } }),
    auditLog: () => prisma.auditLog.findMany({ where }),
  })
}
