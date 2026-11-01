import { z } from "zod"

import {
  MAX_PROPOSED_SLOTS,
  MEETING_MODES,
  MEETING_PROVIDERS,
  MEETING_STATUSES,
  MIN_MEETING_MINUTES,
  MIN_PROPOSED_SLOTS,
} from "./types"

export const meetingModeSchema = z.enum(MEETING_MODES)
export const meetingStatusSchema = z.enum(MEETING_STATUSES)
export const meetingProviderSchema = z.enum(MEETING_PROVIDERS)

/** A time proposed by the client; the end follows the request duration. */
export const proposedSlotSchema = z.object({
  startAt: z.string().min(1),
})

/**
 * A meeting proposal from the client portal: several candidate times for the
 * same duration. The booking rules (notice, booking window, duration,
 * overlaps) are enforced by the service because they depend on the
 * organization settings.
 */
export const createMeetingRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).optional(),
    durationMinutes: z.number().int().min(MIN_MEETING_MINUTES).max(480),
    slots: z
      .array(proposedSlotSchema)
      .min(MIN_PROPOSED_SLOTS)
      .max(MAX_PROPOSED_SLOTS),
    mode: meetingModeSchema.default("online"),
    meetingUrl: z.string().trim().max(500).optional(),
    meetingPassword: z.string().trim().max(200).optional(),
    address: z.string().trim().max(300).optional(),
  })
  .superRefine((value, ctx) => {
    // The online link requirement depends on whether a meeting app is
    // connected, so the service checks it against the organization settings.
    if (value.mode === "in_person" && !value.address) {
      ctx.addIssue({
        code: "custom",
        path: ["address"],
        message: "An address is required for an in-person meeting.",
      })
    }
  })

export const cancelMeetingRequestSchema = z.object({
  id: z.string().min(1),
})

export const acceptMeetingRequestSchema = z.object({
  id: z.string().min(1),
  /** The proposed slot the team confirms. */
  slotId: z.string().min(1),
  /** Internal members invited to the meeting. The acceptor is always added. */
  attendeeIds: z.array(z.string().min(1)).max(50).optional(),
  /** Defaults to the team calendar. */
  calendarId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  note: z.string().trim().max(1000).optional(),
  meetingUrl: z.string().trim().max(500).optional(),
  meetingPassword: z.string().trim().max(200).optional(),
  address: z.string().trim().max(300).optional(),
})

export const declineMeetingRequestSchema = z.object({
  id: z.string().min(1),
  note: z.string().trim().max(1000).optional(),
})

export const updateMeetingSettingsSchema = z.object({
  clientRequestsEnabled: z.boolean(),
  autoDeclineOverlaps: z.boolean(),
  bookingWindowDays: z.number().int().min(1).max(365),
  minNoticeHours: z.number().int().min(0).max(720),
  defaultDurationMinutes: z.number().int().min(MIN_MEETING_MINUTES).max(480),
  maxDurationMinutes: z.number().int().min(MIN_MEETING_MINUTES).max(480),
  provider: meetingProviderSchema,
})

export type CreateMeetingRequestInput = z.infer<
  typeof createMeetingRequestSchema
>
export type CancelMeetingRequestInput = z.infer<
  typeof cancelMeetingRequestSchema
>
export type AcceptMeetingRequestInput = z.infer<
  typeof acceptMeetingRequestSchema
>
export type DeclineMeetingRequestInput = z.infer<
  typeof declineMeetingRequestSchema
>
export type UpdateMeetingSettingsInput = z.infer<
  typeof updateMeetingSettingsSchema
>
