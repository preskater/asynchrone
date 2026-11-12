import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import type { RequestContext } from "@workspace/core/context"
import { can } from "@workspace/organization/roles"

import type {
  CalendarEventRow,
  CalendarRepositoryPort,
  CalendarRow,
} from "./repository"
import type {
  CreateCalendarInput,
  CreateEventInput,
  MoveEventInput,
  SetAttendeeResponseInput,
  UpdateEventInput,
} from "./schemas"
import type { CalendarData, CalendarEvent, CalendarSource } from "./types"

function canWrite(ctx: RequestContext) {
  if (can(ctx, "calendar:write")) return
  throw new ForbiddenError("Your role cannot modify calendars.", {
    code: "role_cannot_modify_calendars",
  })
}

export interface CalendarAuditInput {
  action: string
  entityType: string
  entityId: string
  entityLabel?: string | null
  before?: unknown
  after?: unknown
}

export type CalendarAudit = (
  ctx: RequestContext,
  input: CalendarAuditInput
) => Promise<void>

export class CalendarService {
  constructor(
    private readonly repo: CalendarRepositoryPort,
    private readonly audit?: CalendarAudit
  ) {}

  private record(
    ctx: RequestContext,
    input: CalendarAuditInput
  ): Promise<void> {
    return this.audit ? this.audit(ctx, input) : Promise.resolve()
  }

  private mapCalendar(row: CalendarRow): CalendarSource {
    return {
      id: row.id,
      name: row.name,
      color: row.color as CalendarSource["color"],
      kind: row.kind as CalendarSource["kind"],
      visible: row.visible,
      memberIds: row.members.map((member) => member.userId),
    }
  }

  private mapEvent(row: CalendarEventRow): CalendarEvent {
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      allDay: row.allDay,
      calendarId: row.calendarId,
      location: row.location ?? undefined,
      meetingUrl: row.meetingUrl ?? undefined,
      meetingPassword: row.meetingPassword ?? undefined,
      attendees: row.attendees.map((attendee) => ({
        memberId: attendee.userId,
        response:
          attendee.response as CalendarEvent["attendees"][number]["response"],
      })),
      color: row.color as CalendarEvent["color"],
      reminderMinutes: row.reminderMinutes ?? undefined,
      createdBy: row.createdBy,
    }
  }

  private async loadCalendars(ctx: RequestContext): Promise<CalendarRow[]> {
    let calendars = await this.repo.listCalendars(ctx.organizationId)
    if (calendars.length === 0) {
      await this.repo.createCalendar({
        organizationId: ctx.organizationId,
        name: "Personal",
        kind: "personal",
        color: "blue",
        memberIds: [ctx.userId],
      })
      calendars = await this.repo.listCalendars(ctx.organizationId)
    }
    return calendars
  }

  /** Shell payload: calendar sources only (no events). */
  async listShell(ctx: RequestContext): Promise<CalendarData> {
    const calendars = await this.loadCalendars(ctx)
    return {
      calendars: calendars.map((calendar) => this.mapCalendar(calendar)),
      events: [],
    }
  }

  /**
   * Events for a bounded window around today. The calendar UI can request a
   * different range through `listCalendarEventsAction`.
   */
  async listEvents(
    ctx: RequestContext,
    options: { from?: string; to?: string } = {}
  ): Promise<CalendarEvent[]> {
    const now = new Date()
    const from = options.from
      ? new Date(options.from)
      : new Date(now.getFullYear(), now.getMonth() - 6, 1)
    const to = options.to
      ? new Date(options.to)
      : new Date(now.getFullYear(), now.getMonth() + 12, 0, 23, 59, 59, 999)
    const events = await this.repo.listEvents(ctx.organizationId, {
      from: Number.isNaN(from.getTime()) ? undefined : from,
      to: Number.isNaN(to.getTime()) ? undefined : to,
      take: 1000,
    })
    return events.map((event) => this.mapEvent(event))
  }

  /** Full payload kept for API/MCP compatibility (bounded event window). */
  async list(ctx: RequestContext): Promise<CalendarData> {
    const [shell, events] = await Promise.all([
      this.listShell(ctx),
      this.listEvents(ctx),
    ])
    return { calendars: shell.calendars, events }
  }

  async createEvent(
    ctx: RequestContext,
    input: CreateEventInput
  ): Promise<CalendarEvent> {
    canWrite(ctx)
    const calendar = await this.repo.findCalendar(
      ctx.organizationId,
      input.calendarId
    )
    if (!calendar) throw new NotFoundError("Calendar")

    const attendees = input.attendees?.length
      ? input.attendees
      : [{ memberId: ctx.userId, response: "accepted" as const }]

    const row = await this.repo.createEvent({
      organizationId: ctx.organizationId,
      calendarId: input.calendarId,
      title: input.title,
      description: input.description,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      allDay: input.allDay ?? false,
      location: input.location,
      meetingUrl: input.meetingUrl,
      color: input.color,
      reminderMinutes: input.reminderMinutes,
      createdBy: ctx.userId,
      attendees,
    })
    const event = this.mapEvent(row)
    await this.record(ctx, {
      action: "calendar.event.created",
      entityType: "calendarEvent",
      entityId: event.id,
      entityLabel: event.title,
      after: { title: event.title, calendarId: event.calendarId },
    })
    return event
  }

  async updateEvent(
    ctx: RequestContext,
    id: string,
    input: UpdateEventInput
  ): Promise<CalendarEvent> {
    canWrite(ctx)
    const existing = await this.repo.findEvent(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Event")
    const row = await this.repo.updateEvent(id, {
      title: input.title,
      description: input.description,
      startAt: input.startAt ? new Date(input.startAt) : undefined,
      endAt: input.endAt ? new Date(input.endAt) : undefined,
      allDay: input.allDay,
      calendarId: input.calendarId,
      location: input.location,
      meetingUrl: input.meetingUrl,
      color: input.color,
      reminderMinutes: input.reminderMinutes,
    })
    const event = this.mapEvent(row)
    await this.record(ctx, {
      action: "calendar.event.updated",
      entityType: "calendarEvent",
      entityId: event.id,
      entityLabel: event.title,
      before: { title: existing.title },
      after: { title: event.title },
    })
    return event
  }

  async moveEvent(
    ctx: RequestContext,
    id: string,
    input: MoveEventInput
  ): Promise<CalendarEvent> {
    canWrite(ctx)
    const existing = await this.repo.findEvent(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Event")
    const row = await this.repo.updateEvent(id, {
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
    })
    const event = this.mapEvent(row)
    await this.record(ctx, {
      action: "calendar.event.updated",
      entityType: "calendarEvent",
      entityId: event.id,
      entityLabel: event.title,
      after: { startAt: event.startAt, endAt: event.endAt },
    })
    return event
  }

  async removeEvent(ctx: RequestContext, id: string): Promise<{ id: string }> {
    canWrite(ctx)
    const existing = await this.repo.findEvent(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Event")
    await this.repo.deleteEvent(id)
    await this.record(ctx, {
      action: "calendar.event.deleted",
      entityType: "calendarEvent",
      entityId: id,
      entityLabel: existing.title,
    })
    return { id }
  }

  async addCalendar(
    ctx: RequestContext,
    input: CreateCalendarInput
  ): Promise<CalendarSource> {
    canWrite(ctx)
    const row = await this.repo.createCalendar({
      organizationId: ctx.organizationId,
      name: input.name,
      kind: input.kind,
      color: input.color,
      memberIds: [ctx.userId],
    })
    const calendar = this.mapCalendar(row)
    await this.record(ctx, {
      action: "calendar.created",
      entityType: "calendar",
      entityId: calendar.id,
      entityLabel: calendar.name,
    })
    return calendar
  }

  async toggleCalendar(
    ctx: RequestContext,
    id: string,
    visible?: boolean
  ): Promise<CalendarSource> {
    canWrite(ctx)
    const calendar = await this.repo.findCalendar(ctx.organizationId, id)
    if (!calendar) throw new NotFoundError("Calendar")
    const row = await this.repo.setCalendarVisible(
      id,
      visible ?? !calendar.visible
    )
    const updated = this.mapCalendar(row)
    await this.record(ctx, {
      action: "calendar.updated",
      entityType: "calendar",
      entityId: updated.id,
      entityLabel: updated.name,
      after: { visible: updated.visible },
    })
    return updated
  }

  async setAttendeeResponse(
    ctx: RequestContext,
    eventId: string,
    input: SetAttendeeResponseInput
  ): Promise<CalendarEvent> {
    const existing = await this.repo.findEvent(ctx.organizationId, eventId)
    if (!existing) throw new NotFoundError("Event")
    await this.repo.setAttendeeResponse(eventId, ctx.userId, input.response)
    const row = await this.repo.findEvent(ctx.organizationId, eventId)
    const event = this.mapEvent(row ?? existing)
    await this.record(ctx, {
      action: "calendar.event.responded",
      entityType: "calendarEvent",
      entityId: eventId,
      entityLabel: existing.title,
      after: { response: input.response },
    })
    return event
  }
}
