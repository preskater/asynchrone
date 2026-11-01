/**
 * Storage port for the meetings domain.
 *
 * The package never imports a Prisma client: the owning app binds its generated
 * client and this interface describes only the queries the service needs. The
 * booking transaction is part of the port so accepting a request still creates
 * the calendar event, selects the slot and accepts the request atomically.
 */

export interface MeetingSettingsRow {
  id: string
  organizationId: string
  clientRequestsEnabled: boolean
  autoDeclineOverlaps: boolean
  bookingWindowDays: number
  minNoticeHours: number
  defaultDurationMinutes: number
  maxDurationMinutes: number
  provider: string
  createdAt: Date
  updatedAt: Date
}

export interface MeetingClientRow {
  id: string
  name: string
}

export interface MeetingSlotRow {
  id: string
  requestId: string
  startAt: Date
  endAt: Date
  position: number
  selected: boolean
}

export interface MeetingRequestRow {
  id: string
  organizationId: string
  clientId: string
  client: MeetingClientRow
  title: string
  description: string | null
  slots: MeetingSlotRow[]
  mode: string
  meetingUrl: string | null
  meetingPassword: string | null
  address: string | null
  status: string
  requestedById: string
  requestedByName: string
  decidedById: string | null
  decidedByName: string | null
  decidedAt: Date | null
  decisionNote: string | null
  calendarEventId: string | null
  provider: string
  externalMeetingId: string | null
  externalJoinUrl: string | null
  createdAt: Date
  updatedAt: Date
}

export interface MeetingRequestInclude {
  client: { select: { id: true; name: true } }
  slots: { orderBy: { position: "asc" } }
}

export const meetingRequestInclude: MeetingRequestInclude = {
  client: { select: { id: true, name: true } },
  slots: { orderBy: { position: "asc" } },
}

export interface MeetingSettingsWriteInput {
  clientRequestsEnabled: boolean
  autoDeclineOverlaps: boolean
  bookingWindowDays: number
  minNoticeHours: number
  defaultDurationMinutes: number
  maxDurationMinutes: number
  provider: string
}

export interface MeetingRequestWriteInput {
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
}

export interface MeetingRequestUpdateInput {
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

export interface SlotWindow {
  startAt: Date
  endAt: Date
}

export interface MeetingBookEventInput {
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

export interface MeetingBookDecision {
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

export interface MeetingBookRequestInput {
  requestId: string
  slotId: string
  event: MeetingBookEventInput
  decision: MeetingBookDecision
}

export interface MeetingBookEventData extends Omit<
  MeetingBookEventInput,
  "attendees"
> {
  allDay: boolean
  color: string
  reminderMinutes: number
  attendees: { create: { userId: string; response: string }[] }
}

/** The slice of the transaction client the booking needs. */
export interface MeetingTransaction {
  calendarEvent: {
    create(args: {
      data: MeetingBookEventData
      select: { id: true }
    }): PromiseLike<{ id: string }>
  }
  meetingSlot: {
    updateMany(args: {
      where: { requestId: string; id?: string }
      data: { selected: boolean }
    }): PromiseLike<{ count: number }>
  }
  meetingRequest: {
    update(args: {
      where: { id: string }
      data: MeetingRequestUpdateInput & { status: string; decidedAt: Date }
      include: MeetingRequestInclude
    }): PromiseLike<MeetingRequestRow>
  }
}

export interface MeetingDb {
  meetingSettings: {
    findUnique(args: {
      where: { organizationId: string }
    }): PromiseLike<MeetingSettingsRow | null>
    upsert(args: {
      where: { organizationId: string }
      create: { organizationId: string } & MeetingSettingsWriteInput
      update: MeetingSettingsWriteInput
    }): PromiseLike<MeetingSettingsRow>
  }
  meetingRequest: {
    findMany(args: {
      where: {
        organizationId: string
        clientId?: string
        status?: { in: string[] }
        slots?: { some: { startAt: { lt: Date }; endAt: { gt: Date } } }
        id?: { not: string }
      }
      include: MeetingRequestInclude
      orderBy?:
        { createdAt: "desc" } | Array<{ status: "asc" } | { createdAt: "desc" }>
      take: number
    }): PromiseLike<MeetingRequestRow[]>
    findFirst(args: {
      where: { id: string; organizationId: string; clientId?: string }
      include: MeetingRequestInclude
    }): PromiseLike<MeetingRequestRow | null>
    create(args: {
      data: Omit<MeetingRequestWriteInput, "slots"> & {
        slots: {
          create: { startAt: Date; endAt: Date; position: number }[]
        }
      }
      include: MeetingRequestInclude
    }): PromiseLike<MeetingRequestRow>
    update(args: {
      where: { id: string }
      data: MeetingRequestUpdateInput
      include: MeetingRequestInclude
    }): PromiseLike<MeetingRequestRow>
  }
  meetingSlot: {
    updateMany(args: {
      where: { requestId?: string; id?: string }
      data: { selected: boolean }
    }): PromiseLike<{ count: number }>
  }
  calendarEvent: {
    findMany(args: {
      where: {
        organizationId: string
        calendar: { kind: string }
        startAt: { lt: Date }
        endAt: { gt: Date }
      }
      select: {
        id: true
        title: true
        startAt: true
        endAt: true
      }
      take: number
    }): PromiseLike<{ id: string; title: string; startAt: Date; endAt: Date }[]>
    create(args: {
      data: MeetingBookEventData
      select: { id: true }
    }): PromiseLike<{ id: string }>
  }
  calendar: {
    findFirst(args: {
      where: { organizationId: string; id?: string; kind?: string }
      select: { id: true; name: true }
      orderBy?: { createdAt: "asc" }
    }): PromiseLike<{ id: string; name: string } | null>
    create(args: {
      data: {
        organizationId: string
        name: string
        color: string
        kind: string
        members: { create: { userId: string }[] }
      }
      select: { id: true; name: true }
    }): PromiseLike<{ id: string; name: string }>
  }
  member: {
    findMany(args: {
      where: {
        organizationId: string
        clientId: null
        userId?: { in: string[] }
      }
      select: { userId: true; role?: true }
    }): PromiseLike<{ userId: string; role?: string }[]>
  }
  $transaction<T>(fn: (tx: MeetingTransaction) => Promise<T>): PromiseLike<T>
}
