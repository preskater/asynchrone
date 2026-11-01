import { meetingRequestInclude, type MeetingDb } from "./db"

const ACTIVE_STATUSES = ["pending", "accepted"]

export class MeetingRepository {
  constructor(private readonly db: MeetingDb) {}

  getSettings(organizationId: string) {
    return this.db.meetingSettings.findUnique({ where: { organizationId } })
  }

  upsertSettings(
    organizationId: string,
    data: {
      clientRequestsEnabled: boolean
      autoDeclineOverlaps: boolean
      bookingWindowDays: number
      minNoticeHours: number
      defaultDurationMinutes: number
      maxDurationMinutes: number
      provider: string
    }
  ) {
    return this.db.meetingSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    })
  }

  listRequests(organizationId: string, limit = 100) {
    return this.db.meetingRequest.findMany({
      where: { organizationId },
      include: meetingRequestInclude,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: limit,
    })
  }

  listClientRequests(organizationId: string, clientId: string, limit = 50) {
    return this.db.meetingRequest.findMany({
      where: { organizationId, clientId },
      include: meetingRequestInclude,
      orderBy: { createdAt: "desc" },
      take: limit,
    })
  }

  findRequest(organizationId: string, id: string) {
    return this.db.meetingRequest.findFirst({
      where: { id, organizationId },
      include: meetingRequestInclude,
    })
  }

  findClientRequest(organizationId: string, clientId: string, id: string) {
    return this.db.meetingRequest.findFirst({
      where: { id, organizationId, clientId },
      include: meetingRequestInclude,
    })
  }

  createRequest(data: {
    organizationId: string
    clientId: string
    title: string
    description?: string
    mode: string
    meetingUrl?: string
    meetingPassword?: string
    address?: string
    requestedById: string
    requestedByName: string
    slots: { startAt: Date; endAt: Date }[]
  }) {
    const { slots, ...request } = data
    return this.db.meetingRequest.create({
      data: {
        ...request,
        slots: {
          create: slots.map((slot, position) => ({
            startAt: slot.startAt,
            endAt: slot.endAt,
            position,
          })),
        },
      },
      include: meetingRequestInclude,
    })
  }

  updateRequest(
    id: string,
    data: {
      status?: string
      decidedById?: string
      decidedByName?: string
      decidedAt?: Date
      decisionNote?: string | null
      calendarEventId?: string | null
      provider?: string
      externalMeetingId?: string | null
      externalJoinUrl?: string | null
      meetingUrl?: string | null
      meetingPassword?: string | null
      address?: string | null
    }
  ) {
    return this.db.meetingRequest.update({
      where: { id },
      data,
      include: meetingRequestInclude,
    })
  }

  /**
   * For each proposed slot, whether it overlaps another pending/accepted
   * request or an event booked on a team calendar.
   */
  async findSlotConflicts(
    organizationId: string,
    slots: { startAt: Date; endAt: Date }[],
    excludeRequestId?: string
  ): Promise<boolean[]> {
    if (slots.length === 0) return []
    const from = new Date(
      Math.min(...slots.map((slot) => slot.startAt.getTime()))
    )
    const to = new Date(Math.max(...slots.map((slot) => slot.endAt.getTime())))

    const [requests, events] = await Promise.all([
      this.db.meetingRequest.findMany({
        where: {
          organizationId,
          status: { in: ACTIVE_STATUSES },
          slots: { some: { startAt: { lt: to }, endAt: { gt: from } } },
          ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
        },
        include: meetingRequestInclude,
        take: 100,
      }),
      this.db.calendarEvent.findMany({
        where: {
          organizationId,
          calendar: { kind: "team" },
          startAt: { lt: to },
          endAt: { gt: from },
        },
        select: { id: true, title: true, startAt: true, endAt: true },
        take: 500,
      }),
    ])

    return slots.map(
      (slot) =>
        requests.some((request) =>
          request.slots.some(
            (other) =>
              slot.startAt.getTime() < other.endAt.getTime() &&
              other.startAt.getTime() < slot.endAt.getTime()
          )
        ) ||
        events.some(
          (event) =>
            slot.startAt.getTime() < event.endAt.getTime() &&
            event.startAt.getTime() < slot.endAt.getTime()
        )
    )
  }

  listTeamEvents(organizationId: string, from: Date, to: Date) {
    return this.db.calendarEvent.findMany({
      where: {
        organizationId,
        calendar: { kind: "team" },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: { id: true, title: true, startAt: true, endAt: true },
      take: 500,
    })
  }

  findCalendar(organizationId: string, id: string) {
    return this.db.calendar.findFirst({
      where: { id, organizationId },
      select: { id: true, name: true },
    })
  }

  /** The shared team calendar meetings are booked on, created on demand. */
  async ensureTeamCalendar(organizationId: string, userId: string) {
    const existing = await this.db.calendar.findFirst({
      where: { organizationId, kind: "team" },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    })
    if (existing) return existing

    const created = await this.db.calendar.create({
      data: {
        organizationId,
        name: "Team meetings",
        color: "purple",
        kind: "team",
        members: { create: [{ userId }] },
      },
      select: { id: true, name: true },
    })
    return created
  }

  /**
   * Books an accepted request: creates the calendar event, marks the chosen
   * slot and moves the request to `accepted` in one transaction, so a failure
   * never leaves an orphaned event or a half-decided request.
   */
  bookRequest(input: {
    requestId: string
    slotId: string
    event: {
      organizationId: string
      calendarId: string
      title: string
      description?: string
      startAt: Date
      endAt: Date
      location?: string
      meetingUrl?: string
      meetingPassword?: string
      createdBy: string
      attendees: { userId: string; response: string }[]
    }
    decision: {
      decidedById: string
      decidedByName: string
      decisionNote: string | null
      provider: string
      externalMeetingId: string | null
      externalJoinUrl: string | null
      meetingUrl: string | null
      meetingPassword: string | null
      address: string | null
    }
  }) {
    return this.db.$transaction(async (tx) => {
      const event = await tx.calendarEvent.create({
        data: {
          organizationId: input.event.organizationId,
          calendarId: input.event.calendarId,
          title: input.event.title,
          description: input.event.description,
          startAt: input.event.startAt,
          endAt: input.event.endAt,
          allDay: false,
          location: input.event.location,
          meetingUrl: input.event.meetingUrl,
          meetingPassword: input.event.meetingPassword,
          color: "purple",
          reminderMinutes: 15,
          createdBy: input.event.createdBy,
          attendees: { create: input.event.attendees },
        },
        select: { id: true },
      })

      await tx.meetingSlot.updateMany({
        where: { requestId: input.requestId },
        data: { selected: false },
      })
      await tx.meetingSlot.updateMany({
        where: { id: input.slotId, requestId: input.requestId },
        data: { selected: true },
      })

      return tx.meetingRequest.update({
        where: { id: input.requestId },
        data: {
          status: "accepted",
          decidedAt: new Date(),
          calendarEventId: event.id,
          ...input.decision,
        },
        include: meetingRequestInclude,
      })
    })
  }

  /** Internal members that receive new meeting requests. */
  async listManagers(organizationId: string) {
    return this.db.member.findMany({
      where: { organizationId, clientId: null },
      select: { userId: true, role: true },
    })
  }

  /** Internal members among `userIds`, used to validate meeting attendees. */
  findInternalMembers(organizationId: string, userIds: string[]) {
    return this.db.member.findMany({
      where: { organizationId, clientId: null, userId: { in: userIds } },
      select: { userId: true },
    })
  }
}

export type {
  MeetingRequestRow,
  MeetingSettingsRow,
  MeetingSlotRow,
} from "./db"

/**
 * The slice of {@link MeetingRepository} the service depends on. The booking
 * rules are unit-tested against a fake port; the calendars app binds the real
 * repository over the generated client.
 */
export type MeetingRepositoryPort = Pick<
  MeetingRepository,
  | "getSettings"
  | "upsertSettings"
  | "listRequests"
  | "listClientRequests"
  | "findRequest"
  | "findClientRequest"
  | "createRequest"
  | "updateRequest"
  | "findSlotConflicts"
  | "listTeamEvents"
  | "findCalendar"
  | "ensureTeamCalendar"
  | "bookRequest"
  | "listManagers"
  | "findInternalMembers"
>
