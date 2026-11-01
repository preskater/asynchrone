import { z } from "zod"

export const eventColorSchema = z.enum([
  "blue",
  "green",
  "orange",
  "red",
  "purple",
])

export const attendeeResponseSchema = z.enum([
  "accepted",
  "tentative",
  "declined",
  "pending",
])

export const calendarKindSchema = z.enum(["personal", "team"])

export const attendeeInputSchema = z.object({
  memberId: z.string().min(1),
  response: attendeeResponseSchema.default("pending"),
})

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean().optional(),
  calendarId: z.string().min(1),
  location: z.string().max(300).optional(),
  meetingUrl: z.string().max(500).optional(),
  attendees: z.array(attendeeInputSchema).optional(),
  color: eventColorSchema.default("blue"),
  reminderMinutes: z.number().int().nonnegative().optional(),
})

export const updateEventSchema = createEventSchema.partial().omit({
  attendees: true,
})

export const moveEventSchema = z.object({
  startAt: z.string(),
  endAt: z.string(),
})

export const createCalendarSchema = z.object({
  name: z.string().min(1).max(120),
  kind: calendarKindSchema.default("personal"),
  color: eventColorSchema.default("blue"),
})

export const toggleCalendarSchema = z.object({
  visible: z.boolean().optional(),
})

export const setAttendeeResponseSchema = z.object({
  response: attendeeResponseSchema,
})

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
export type MoveEventInput = z.infer<typeof moveEventSchema>
export type CreateCalendarInput = z.infer<typeof createCalendarSchema>
export type SetAttendeeResponseInput = z.infer<typeof setAttendeeResponseSchema>
