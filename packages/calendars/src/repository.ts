import type { CalendarDb, CalendarEventUpdateInput } from "./db"

export const calendarInclude = {
  events: {
    orderBy: { startAt: "asc" as const },
    include: { attendees: true },
  },
}

export class CalendarRepository {
  constructor(private readonly db: CalendarDb) {}

  listCalendars(organizationId: string) {
    return this.db.calendar.findMany({
      where: { organizationId },
      include: { members: true },
      orderBy: { createdAt: "asc" },
    })
  }

  findCalendar(organizationId: string, id: string) {
    return this.db.calendar.findFirst({
      where: { id, organizationId },
      include: { members: true },
    })
  }

  createCalendar(data: {
    organizationId: string
    name: string
    kind: string
    color: string
    memberIds: string[]
  }) {
    const { memberIds, ...calendar } = data
    return this.db.calendar.create({
      data: {
        ...calendar,
        members: {
          create: memberIds.map((userId) => ({ userId })),
        },
      },
      include: { members: true },
    })
  }

  setCalendarVisible(id: string, visible: boolean) {
    return this.db.calendar.update({
      where: { id },
      data: { visible },
      include: { members: true },
    })
  }

  deleteCalendar(id: string) {
    return this.db.calendar.delete({ where: { id } })
  }

  /**
   * Events inside a date window. Calendar screens never need the full
   * history, so callers pass a bounded range.
   */
  listEvents(
    organizationId: string,
    options: { from?: Date; to?: Date; take?: number } = {}
  ) {
    return this.db.calendarEvent.findMany({
      where: {
        organizationId,
        ...(options.from || options.to
          ? {
              startAt: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
      },
      include: { attendees: true },
      orderBy: { startAt: "asc" },
      take: options.take ?? 1000,
    })
  }

  findEvent(organizationId: string, id: string) {
    return this.db.calendarEvent.findFirst({
      where: { id, organizationId },
      include: { attendees: true },
    })
  }

  createEvent(data: {
    organizationId: string
    calendarId: string
    title: string
    description?: string
    startAt: Date
    endAt: Date
    allDay: boolean
    location?: string
    meetingUrl?: string
    color: string
    reminderMinutes?: number
    createdBy: string
    attendees: { memberId: string; response: string }[]
  }) {
    const { attendees, ...event } = data
    return this.db.calendarEvent.create({
      data: {
        ...event,
        attendees: {
          create: attendees.map((attendee) => ({
            userId: attendee.memberId,
            response: attendee.response,
          })),
        },
      },
      include: { attendees: true },
    })
  }

  updateEvent(id: string, data: CalendarEventUpdateInput) {
    return this.db.calendarEvent.update({
      where: { id },
      data,
      include: { attendees: true },
    })
  }

  setAttendees(
    eventId: string,
    attendees: { memberId: string; response: string }[]
  ) {
    return this.db.$transaction([
      this.db.eventAttendee.deleteMany({ where: { eventId } }),
      this.db.eventAttendee.createMany({
        data: attendees.map((attendee) => ({
          eventId,
          userId: attendee.memberId,
          response: attendee.response,
        })),
        skipDuplicates: true,
      }),
    ])
  }

  setAttendeeResponse(eventId: string, userId: string, response: string) {
    return this.db.eventAttendee.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: { response },
      create: { eventId, userId, response },
    })
  }

  deleteEvent(id: string) {
    return this.db.calendarEvent.delete({ where: { id } })
  }
}

export type { CalendarEventRow, CalendarRow } from "./db"

/**
 * The slice of {@link CalendarRepository} the service depends on. Kept as a
 * port so the calendar rules can be unit-tested without a database and so the
 * eventual calendars app can bind the same service to its own client.
 */
export type CalendarRepositoryPort = Pick<
  CalendarRepository,
  | "listCalendars"
  | "findCalendar"
  | "createCalendar"
  | "setCalendarVisible"
  | "listEvents"
  | "findEvent"
  | "createEvent"
  | "updateEvent"
  | "deleteEvent"
  | "setAttendeeResponse"
>
