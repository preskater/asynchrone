import type { RequestContext } from "@workspace/core/context"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@workspace/core/errors"
import {
  can,
  parseRoles,
  type Capability,
} from "@workspace/organization/roles"

import { resolveMeetingProvider } from "./providers"
import type {
  MeetingRepositoryPort,
  MeetingRequestRow,
  MeetingSettingsRow,
  MeetingSlotRow,
} from "./repository"
import type {
  AcceptMeetingRequestInput,
  CreateMeetingRequestInput,
  DeclineMeetingRequestInput,
  UpdateMeetingSettingsInput,
} from "./schemas"
import {
  DEFAULT_MEETING_SETTINGS,
  MAX_PROPOSED_SLOTS,
  MEETING_PROVIDERS,
  MIN_MEETING_MINUTES,
  MIN_PROPOSED_SLOTS,
  type MeetingMode,
  type MeetingProviderId,
  type MeetingRequestData,
  type MeetingRequestsData,
  type MeetingSettingsData,
  type MeetingSlotData,
  type MeetingStatus,
  type PortalMeetingsData,
  type PortalMeetingSettings,
} from "./types"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

type MeetingRow = MeetingRequestRow
type SlotRow = MeetingSlotRow

/**
 * The portal identity a meeting-request call is made with. Copilot passes its
 * own `PortalContext`; the shape is narrowed here so the package stays free of
 * the auth/session runtime.
 */
export interface MeetingPortalContext {
  userId: string
  userName: string
  organizationId: string
  clientId: string
  clientName: string
}

/** Notification side effect emitted when a client requests a meeting. */
export interface MeetingNotifier {
  notify(args: {
    organizationId: string
    userId: string
    actorId: string
    type: "meeting.requested"
    data: Record<string, unknown>
  }): Promise<unknown>
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime()
}

function earliestStart(row: MeetingRow): number {
  return row.slots.length > 0
    ? Math.min(...row.slots.map((slot) => slot.startAt.getTime()))
    : Number.POSITIVE_INFINITY
}

/** Portal users never reach this service through the workspace context. */
function requireStaff(ctx: RequestContext, capability: Capability) {
  if (can(ctx, capability)) return
  throw new ForbiddenError("Your role cannot manage meetings.", {
    code: "role_cannot_manage_meetings",
  })
}

export interface MeetingAuditInput {
  action: string
  entityType: string
  entityId: string
  entityLabel?: string | null
  before?: unknown
  after?: unknown
}

export type MeetingAudit = (
  ctx: RequestContext,
  input: MeetingAuditInput
) => Promise<void>

/** Portal callers have no email/role on their context; audit uses client. */
function auditContext(
  ctx: MeetingPortalContext | RequestContext
): RequestContext {
  if ("userEmail" in ctx && "roles" in ctx) return ctx
  return {
    userId: ctx.userId,
    userName: ctx.userName,
    userEmail: "",
    organizationId: ctx.organizationId,
    roles: ["client"],
  }
}

export class MeetingService {
  constructor(
    private readonly repo: MeetingRepositoryPort,
    private readonly notifier: MeetingNotifier,
    private readonly audit?: MeetingAudit
  ) {}

  private record(
    ctx: RequestContext,
    input: MeetingAuditInput
  ): Promise<void> {
    return this.audit ? this.audit(ctx, input) : Promise.resolve()
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  async getSettings(ctx: RequestContext): Promise<MeetingSettingsData> {
    requireStaff(ctx, "workspace:read")
    return this.mapSettings(await this.repo.getSettings(ctx.organizationId))
  }

  async updateSettings(
    ctx: RequestContext,
    input: UpdateMeetingSettingsInput
  ): Promise<MeetingSettingsData> {
    requireStaff(ctx, "meeting:manage")

    if (input.defaultDurationMinutes > input.maxDurationMinutes) {
      throw new ValidationError(
        "The default duration cannot exceed the maximum duration.",
        undefined,
        {
          code: "meeting_duration_invalid",
          params: { min: MIN_MEETING_MINUTES, max: input.maxDurationMinutes },
        }
      )
    }
    if (input.minNoticeHours > input.bookingWindowDays * 24) {
      throw new ValidationError(
        "The minimum notice must fit inside the booking window.",
        undefined,
        { code: "meeting_notice_beyond_window" }
      )
    }

    const row = await this.repo.upsertSettings(ctx.organizationId, {
      clientRequestsEnabled: input.clientRequestsEnabled,
      autoDeclineOverlaps: input.autoDeclineOverlaps,
      bookingWindowDays: input.bookingWindowDays,
      minNoticeHours: input.minNoticeHours,
      defaultDurationMinutes: input.defaultDurationMinutes,
      maxDurationMinutes: input.maxDurationMinutes,
      provider: input.provider,
    })
    const settings = this.mapSettings(row)
    await this.record(ctx, {
      action: "meeting.settings.updated",
      entityType: "meetingSettings",
      entityId: ctx.organizationId,
      entityLabel: "Meeting settings",
      after: { provider: settings.provider },
    })
    return settings
  }

  // ---------------------------------------------------------------------------
  // Client portal
  // ---------------------------------------------------------------------------

  /** Requests of the signed-in client's company, with the booking rules. */
  async getPortalMeetings(
    ctx: MeetingPortalContext
  ): Promise<PortalMeetingsData> {
    const [row, requests] = await Promise.all([
      this.repo.getSettings(ctx.organizationId),
      this.repo.listClientRequests(ctx.organizationId, ctx.clientId),
    ])
    const settings = this.mapSettings(row)
    const slots = await this.slotsWithConflicts(ctx.organizationId, requests)
    return {
      settings: this.toPortalSettings(settings),
      requests: requests.map((request) =>
        this.mapRequest(request, slots.get(request.id) ?? [])
      ),
    }
  }

  /** Create a multi-slot proposal inside the allowed timeline. */
  async createRequest(
    ctx: MeetingPortalContext,
    input: CreateMeetingRequestInput
  ): Promise<MeetingRequestData> {
    const settings = this.mapSettings(
      await this.repo.getSettings(ctx.organizationId)
    )
    if (!settings.clientRequestsEnabled) {
      throw new ForbiddenError(
        "This organization does not take meeting requests from clients.",
        { code: "meeting_requests_disabled" }
      )
    }

    const mode = input.mode as MeetingMode
    const meetingUrl = input.meetingUrl?.trim() || undefined
    const meetingPassword = input.meetingPassword?.trim() || undefined
    const address = input.address?.trim() || undefined

    if (mode === "online" && !meetingUrl && settings.provider === "manual") {
      throw new ValidationError("A meeting link is required.", undefined, {
        code: "meeting_url_required",
      })
    }
    if (mode === "in_person" && !address) {
      throw new ValidationError("An address is required.", undefined, {
        code: "meeting_address_required",
      })
    }

    const durationMinutes = input.durationMinutes
    if (
      durationMinutes < MIN_MEETING_MINUTES ||
      durationMinutes > settings.maxDurationMinutes
    ) {
      throw new ValidationError(
        "The meeting duration is not allowed.",
        undefined,
        {
          code: "meeting_duration_invalid",
          params: {
            min: MIN_MEETING_MINUTES,
            max: settings.maxDurationMinutes,
          },
        }
      )
    }

    if (
      input.slots.length < MIN_PROPOSED_SLOTS ||
      input.slots.length > MAX_PROPOSED_SLOTS
    ) {
      throw new ValidationError(
        "Propose between two and five meeting times.",
        undefined,
        {
          code: "meeting_slots_invalid",
          params: { min: MIN_PROPOSED_SLOTS, max: MAX_PROPOSED_SLOTS },
        }
      )
    }

    const slots = input.slots.map((proposed) => {
      const startAt = new Date(proposed.startAt)
      if (Number.isNaN(startAt.getTime())) {
        throw new ValidationError("The meeting times are invalid.", undefined, {
          code: "meeting_invalid_window",
        })
      }
      return {
        startAt,
        endAt: new Date(startAt.getTime() + durationMinutes * 60000),
      }
    })

    const uniqueStarts = new Set(slots.map((slot) => slot.startAt.getTime()))
    if (uniqueStarts.size !== slots.length) {
      throw new ValidationError(
        "The proposed times must be different.",
        undefined,
        { code: "meeting_slots_duplicate" }
      )
    }

    const now = Date.now()
    for (const slot of slots) {
      if (slot.startAt.getTime() < now + settings.minNoticeHours * HOUR_MS) {
        throw new ValidationError(
          "The requested slot is too soon.",
          undefined,
          {
            code: "meeting_slot_too_soon",
            params: { hours: settings.minNoticeHours },
          }
        )
      }
      if (slot.startAt.getTime() > now + settings.bookingWindowDays * DAY_MS) {
        throw new ValidationError(
          "The requested slot is outside the booking window.",
          undefined,
          {
            code: "meeting_slot_outside_window",
            params: { days: settings.bookingWindowDays },
          }
        )
      }
    }

    const conflictFlags = await this.repo.findSlotConflicts(
      ctx.organizationId,
      slots
    )
    // A proposal is only refused when none of its times is free; otherwise it
    // is sent to the team and the unavailable slots are flagged.
    if (
      slots.length > 0 &&
      conflictFlags.every(Boolean) &&
      settings.autoDeclineOverlaps
    ) {
      throw new ConflictError(
        "Another meeting is already booked in every proposed slot.",
        { code: "meeting_overlap" }
      )
    }

    const row = await this.repo.createRequest({
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      mode,
      meetingUrl: mode === "online" ? meetingUrl : undefined,
      meetingPassword: mode === "online" ? meetingPassword : undefined,
      address: mode === "in_person" ? address : undefined,
      requestedById: ctx.userId,
      requestedByName: ctx.userName,
      slots,
    })

    await this.notifyManagers(ctx, row)
    await this.record(auditContext(ctx), {
      action: "meeting.request.created",
      entityType: "meetingRequest",
      entityId: row.id,
      entityLabel: row.title,
      after: { clientId: row.clientId, status: row.status },
    })
    return this.mapRequest(
      row,
      row.slots.map((slot, index) =>
        this.mapSlot(slot, conflictFlags[index] ?? false)
      )
    )
  }

  /** A client withdraws one of their pending requests. */
  async cancelRequest(
    ctx: MeetingPortalContext,
    id: string
  ): Promise<MeetingRequestData> {
    const row = await this.repo.findClientRequest(
      ctx.organizationId,
      ctx.clientId,
      id
    )
    if (!row) throw new NotFoundError("meetingRequest")
    if (row.status !== "pending") {
      throw new ValidationError(
        "This request is no longer pending.",
        undefined,
        {
          code: "meeting_not_pending",
        }
      )
    }
    const updated = await this.repo.updateRequest(row.id, {
      status: "cancelled",
      decidedAt: new Date(),
      decidedByName: ctx.userName,
      decidedById: ctx.userId,
    })
    await this.record(auditContext(ctx), {
      action: "meeting.request.cancelled",
      entityType: "meetingRequest",
      entityId: updated.id,
      entityLabel: updated.title,
    })
    return this.mapRequest(
      updated,
      updated.slots.map((slot) => this.mapSlot(slot, false))
    )
  }

  // ---------------------------------------------------------------------------
  // Team inbox
  // ---------------------------------------------------------------------------

  async listRequests(ctx: RequestContext): Promise<MeetingRequestsData> {
    requireStaff(ctx, "workspace:read")
    const [row, requests] = await Promise.all([
      this.repo.getSettings(ctx.organizationId),
      this.repo.listRequests(ctx.organizationId),
    ])
    const settings = this.mapSettings(row)
    const slots = await this.slotsWithConflicts(ctx.organizationId, requests)
    const sorted = [...requests].sort((a, b) => {
      const rank = statusRank(a.status) - statusRank(b.status)
      return rank !== 0 ? rank : earliestStart(a) - earliestStart(b)
    })
    return {
      settings,
      requests: sorted.map((request) =>
        this.mapRequest(request, slots.get(request.id) ?? [])
      ),
    }
  }

  /** Accept one proposed slot: book a team calendar event and notify. */
  async acceptRequest(
    ctx: RequestContext,
    input: AcceptMeetingRequestInput
  ): Promise<MeetingRequestData> {
    requireStaff(ctx, "calendar:write")
    const row = await this.repo.findRequest(ctx.organizationId, input.id)
    if (!row) throw new NotFoundError("meetingRequest")
    if (row.status !== "pending") {
      throw new ValidationError(
        "This request is no longer pending.",
        undefined,
        {
          code: "meeting_not_pending",
        }
      )
    }

    const slot = row.slots.find((entry) => entry.id === input.slotId)
    if (!slot) throw new NotFoundError("meetingSlot")

    const settings = this.mapSettings(
      await this.repo.getSettings(ctx.organizationId)
    )
    if (settings.autoDeclineOverlaps) {
      const [conflict] = await this.repo.findSlotConflicts(
        ctx.organizationId,
        [{ startAt: slot.startAt, endAt: slot.endAt }],
        row.id
      )
      if (conflict) {
        throw new ConflictError(
          "Another meeting is already booked in this slot.",
          { code: "meeting_overlap" }
        )
      }
    }

    // Validate everything the booking depends on before creating an external
    // meeting: a failure after `createMeeting` would orphan it.
    const calendar = input.calendarId
      ? await this.repo.findCalendar(ctx.organizationId, input.calendarId)
      : await this.repo.ensureTeamCalendar(ctx.organizationId, ctx.userId)
    if (!calendar) throw new NotFoundError("calendar")

    const attendeeIds = await this.resolveAttendees(ctx, input.attendeeIds)

    const provider = resolveMeetingProvider(settings.provider)
    const result = await provider.createMeeting({
      organizationId: ctx.organizationId,
      title: row.title,
      startAt: slot.startAt,
      endAt: slot.endAt,
      meetingUrl: input.meetingUrl?.trim() || row.meetingUrl || undefined,
      meetingPassword:
        input.meetingPassword?.trim() || row.meetingPassword || undefined,
    })

    const meetingUrl =
      input.meetingUrl?.trim() || result.joinUrl || row.meetingUrl || undefined
    const meetingPassword =
      input.meetingPassword?.trim() ||
      result.password ||
      row.meetingPassword ||
      undefined
    const address = input.address?.trim() || row.address || undefined

    let updated
    try {
      updated = await this.repo.bookRequest({
        requestId: row.id,
        slotId: slot.id,
        event: {
          organizationId: ctx.organizationId,
          calendarId: calendar.id,
          title: input.title?.trim() || row.title,
          description: this.eventDescription(row),
          startAt: slot.startAt,
          endAt: slot.endAt,
          location: row.mode === "in_person" ? address : undefined,
          meetingUrl: row.mode === "online" ? meetingUrl : undefined,
          meetingPassword: row.mode === "online" ? meetingPassword : undefined,
          createdBy: ctx.userId,
          attendees: attendeeIds.map((userId) => ({
            userId,
            response: userId === ctx.userId ? "accepted" : "pending",
          })),
        },
        decision: {
          decidedById: ctx.userId,
          decidedByName: ctx.userName,
          decisionNote: input.note?.trim() || null,
          provider: result.provider,
          externalMeetingId: result.externalId ?? null,
          externalJoinUrl: result.joinUrl ?? null,
          meetingUrl: meetingUrl ?? null,
          meetingPassword: meetingPassword ?? null,
          address: address ?? null,
        },
      })
    } catch (error) {
      // The meeting app already created the event: drop it rather than leaving
      // it behind when the local booking fails.
      if (result.externalId && provider.cancelMeeting) {
        await provider
          .cancelMeeting({
            organizationId: ctx.organizationId,
            externalMeetingId: result.externalId,
          })
          .catch(() => undefined)
      }
      throw error
    }

    const accepted = this.mapRequest(
      updated,
      updated.slots.map((entry) => this.mapSlot(entry, false))
    )
    await this.record(ctx, {
      action: "meeting.request.accepted",
      entityType: "meetingRequest",
      entityId: accepted.id,
      entityLabel: accepted.title,
      after: { slotId: input.slotId },
    })
    return accepted
  }

  async declineRequest(
    ctx: RequestContext,
    input: DeclineMeetingRequestInput
  ): Promise<MeetingRequestData> {
    requireStaff(ctx, "calendar:write")
    const row = await this.repo.findRequest(ctx.organizationId, input.id)
    if (!row) throw new NotFoundError("meetingRequest")
    if (row.status !== "pending") {
      throw new ValidationError(
        "This request is no longer pending.",
        undefined,
        {
          code: "meeting_not_pending",
        }
      )
    }

    const updated = await this.repo.updateRequest(row.id, {
      status: "declined",
      decidedById: ctx.userId,
      decidedByName: ctx.userName,
      decidedAt: new Date(),
      decisionNote: input.note?.trim() || null,
    })
    const declined = this.mapRequest(
      updated,
      updated.slots.map((slot) => this.mapSlot(slot, false))
    )
    await this.record(ctx, {
      action: "meeting.request.declined",
      entityType: "meetingRequest",
      entityId: declined.id,
      entityLabel: declined.title,
    })
    return declined
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async notifyManagers(ctx: MeetingPortalContext, row: MeetingRow) {
    const members = await this.repo.listManagers(ctx.organizationId)
    await Promise.all(
      members
        .filter((member) => can(parseRoles(member.role), "calendar:write"))
        .map((member) =>
          this.notifier.notify({
            organizationId: ctx.organizationId,
            userId: member.userId,
            actorId: ctx.userId,
            type: "meeting.requested",
            data: {
              actorName: ctx.userName,
              clientName: ctx.clientName,
              clientId: ctx.clientId,
              requestId: row.id,
              title: row.title,
              slotCount: row.slots.length,
              slots: row.slots.map((slot) => slot.startAt.toISOString()),
            },
          })
        )
    )
  }

  /**
   * Attendees are internal members of the organization: an accepted request
   * must not be able to invite a user from another tenant.
   */
  private async resolveAttendees(
    ctx: RequestContext,
    extraIds: string[] | undefined
  ): Promise<string[]> {
    const ids = [...new Set([ctx.userId, ...(extraIds ?? [])])]
    if (ids.length === 0) return ids
    const members = await this.repo.findInternalMembers(ctx.organizationId, ids)
    const known = new Set(members.map((member) => member.userId))
    const unknown = ids.filter((id) => !known.has(id))
    if (unknown.length > 0) {
      throw new ValidationError("Unknown meeting attendees.", undefined, {
        code: "meeting_attendee_invalid",
        params: { count: String(unknown.length) },
      })
    }
    return ids
  }

  private eventDescription(row: MeetingRow): string {
    const lines = [
      `Client: ${row.client.name}`,
      `Requested by: ${row.requestedByName}`,
    ]
    if (row.description) lines.push("", row.description)
    return lines.join("\n")
  }

  /** Slot conflicts of a batch of requests, resolved from one query. */
  private async slotsWithConflicts(
    organizationId: string,
    rows: MeetingRow[]
  ): Promise<Map<string, MeetingSlotData[]>> {
    const result = new Map<string, MeetingSlotData[]>()
    const active = rows.filter(
      (row) => row.status === "pending" || row.status === "accepted"
    )
    const activeSlots = active.flatMap((row) => row.slots)
    if (activeSlots.length === 0) {
      for (const row of rows) {
        result.set(
          row.id,
          row.slots.map((slot) => this.mapSlot(slot, false))
        )
      }
      return result
    }

    const from = new Date(
      Math.min(...activeSlots.map((slot) => slot.startAt.getTime()))
    )
    const to = new Date(
      Math.max(...activeSlots.map((slot) => slot.endAt.getTime()))
    )
    const events = await this.repo.listTeamEvents(organizationId, from, to)

    for (const row of rows) {
      const isActive = row.status === "pending" || row.status === "accepted"
      result.set(
        row.id,
        row.slots.map((slot) => {
          const conflict =
            isActive &&
            (active.some(
              (other) =>
                other.id !== row.id &&
                other.slots.some((otherSlot) =>
                  overlaps(
                    slot.startAt,
                    slot.endAt,
                    otherSlot.startAt,
                    otherSlot.endAt
                  )
                )
            ) ||
              events.some(
                (event) =>
                  event.id !== row.calendarEventId &&
                  overlaps(slot.startAt, slot.endAt, event.startAt, event.endAt)
              ))
          return this.mapSlot(slot, conflict)
        })
      )
    }
    return result
  }

  private mapSlot(slot: SlotRow, hasConflict: boolean): MeetingSlotData {
    return {
      id: slot.id,
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      hasConflict,
      selected: slot.selected,
    }
  }

  private mapSettings(row: MeetingSettingsRow | null): MeetingSettingsData {
    if (!row) return { ...DEFAULT_MEETING_SETTINGS }
    return {
      clientRequestsEnabled: row.clientRequestsEnabled,
      autoDeclineOverlaps: row.autoDeclineOverlaps,
      bookingWindowDays: row.bookingWindowDays,
      minNoticeHours: row.minNoticeHours,
      defaultDurationMinutes: row.defaultDurationMinutes,
      maxDurationMinutes: row.maxDurationMinutes,
      provider: (MEETING_PROVIDERS as readonly string[]).includes(row.provider)
        ? (row.provider as MeetingProviderId)
        : "manual",
    }
  }

  private toPortalSettings(
    settings: MeetingSettingsData
  ): PortalMeetingSettings {
    return {
      clientRequestsEnabled: settings.clientRequestsEnabled,
      bookingWindowDays: settings.bookingWindowDays,
      minNoticeHours: settings.minNoticeHours,
      defaultDurationMinutes: settings.defaultDurationMinutes,
      maxDurationMinutes: settings.maxDurationMinutes,
      requiresMeetingUrl: settings.provider === "manual",
    }
  }

  private mapRequest(
    row: MeetingRow,
    slots: MeetingSlotData[]
  ): MeetingRequestData {
    return {
      id: row.id,
      clientId: row.clientId,
      clientName: row.client.name,
      title: row.title,
      description: row.description ?? undefined,
      slots,
      mode: row.mode as MeetingMode,
      meetingUrl: row.meetingUrl ?? undefined,
      meetingPassword: row.meetingPassword ?? undefined,
      address: row.address ?? undefined,
      status: row.status as MeetingStatus,
      requestedByName: row.requestedByName,
      decidedByName: row.decidedByName ?? undefined,
      decidedAt: row.decidedAt?.toISOString(),
      decisionNote: row.decisionNote ?? undefined,
      calendarEventId: row.calendarEventId ?? undefined,
      provider: (MEETING_PROVIDERS as readonly string[]).includes(row.provider)
        ? (row.provider as MeetingProviderId)
        : "manual",
      createdAt: row.createdAt.toISOString(),
    }
  }
}

function statusRank(status: string): number {
  switch (status) {
    case "pending":
      return 0
    case "accepted":
      return 1
    case "declined":
      return 2
    default:
      return 3
  }
}
