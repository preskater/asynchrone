/**
 * Storage port for the calendars domain.
 *
 * The package never imports a Prisma client: the owning app binds its generated
 * client, which is structurally compatible with this narrow interface (the
 * same pattern as `@workspace/audit`). Unit tests pass a fake.
 */

export interface CalendarMemberRow {
  id: string
  calendarId: string
  userId: string
}

export interface CalendarRow {
  id: string
  organizationId: string
  name: string
  color: string
  kind: string
  visible: boolean
  createdAt: Date
  members: CalendarMemberRow[]
}

export interface EventAttendeeRow {
  id: string
  eventId: string
  userId: string
  response: string
}

export interface CalendarEventRow {
  id: string
  organizationId: string
  calendarId: string
  title: string
  description: string | null
  startAt: Date
  endAt: Date
  allDay: boolean
  location: string | null
  meetingUrl: string | null
  meetingPassword: string | null
  color: string
  reminderMinutes: number | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
  attendees: EventAttendeeRow[]
}

export interface CalendarCreateInput {
  organizationId: string
  name: string
  kind: string
  color: string
  members: { create: { userId: string }[] }
}

export interface CalendarEventCreateInput {
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
  attendees: { create: { userId: string; response: string }[] }
}

export interface CalendarEventUpdateInput {
  title?: string
  description?: string
  startAt?: Date
  endAt?: Date
  allDay?: boolean
  calendarId?: string
  location?: string
  meetingUrl?: string
  color?: string
  reminderMinutes?: number
}

export interface CalendarDb {
  calendar: {
    findMany(args: {
      where: { organizationId: string }
      include: { members: true }
      orderBy: { createdAt: "asc" }
    }): PromiseLike<CalendarRow[]>
    findFirst(args: {
      where: { id: string; organizationId: string }
      include: { members: true }
    }): PromiseLike<CalendarRow | null>
    create(args: {
      data: CalendarCreateInput
      include: { members: true }
    }): PromiseLike<CalendarRow>
    update(args: {
      where: { id: string }
      data: { visible: boolean }
      include: { members: true }
    }): PromiseLike<CalendarRow>
    delete(args: { where: { id: string } }): PromiseLike<unknown>
  }
  calendarEvent: {
    findMany(args: {
      where: {
        organizationId: string
        startAt?: { gte?: Date; lte?: Date }
      }
      include: { attendees: true }
      orderBy: { startAt: "asc" }
      take: number
    }): PromiseLike<CalendarEventRow[]>
    findFirst(args: {
      where: { id: string; organizationId: string }
      include: { attendees: true }
    }): PromiseLike<CalendarEventRow | null>
    create(args: {
      data: CalendarEventCreateInput
      include: { attendees: true }
    }): PromiseLike<CalendarEventRow>
    update(args: {
      where: { id: string }
      data: CalendarEventUpdateInput
      include: { attendees: true }
    }): PromiseLike<CalendarEventRow>
    delete(args: { where: { id: string } }): PromiseLike<unknown>
  }
  eventAttendee: {
    deleteMany(args: {
      where: { eventId: string }
    }): PromiseLike<{ count: number }>
    createMany(args: {
      data: { eventId: string; userId: string; response: string }[]
      skipDuplicates: boolean
    }): PromiseLike<{ count: number }>
    upsert(args: {
      where: { eventId_userId: { eventId: string; userId: string } }
      update: { response: string }
      create: { eventId: string; userId: string; response: string }
    }): PromiseLike<unknown>
  }
  $transaction(promises: PromiseLike<unknown>[]): PromiseLike<unknown>
}
