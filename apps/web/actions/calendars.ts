"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"
import { revalidateOrgPath } from "@/lib/organization/paths"
import { calendarService } from "@/lib/calendars"
import {
  createCalendarSchema,
  createEventSchema,
  moveEventSchema,
  setAttendeeResponseSchema,
  updateEventSchema,
} from "@workspace/calendars/schemas"

export const listCalendarDataAction = withAction(async () => {
  const ctx = await getRequestContext()
  return calendarService.list(ctx)
})

export const listCalendarEventsAction = withAction(
  async (range?: { from?: string; to?: string }) => {
    const ctx = await getRequestContext()
    return calendarService.listEvents(ctx, range)
  }
)

export const createEventAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(createEventSchema, input)
  const event = await calendarService.createEvent(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/calendars")
  await revalidateOrgPath(ctx.organizationId)
  return event
})

export const updateEventAction = withAction(
  async (id: string, input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(updateEventSchema, input)
    const event = await calendarService.updateEvent(ctx, id, parsed)
    await revalidateOrgPath(ctx.organizationId, "/calendars")
    return event
  }
)

export const moveEventAction = withAction(
  async (id: string, input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(moveEventSchema, input)
    const event = await calendarService.moveEvent(ctx, id, parsed)
    await revalidateOrgPath(ctx.organizationId, "/calendars")
    return event
  }
)

export const deleteEventAction = withAction(async (id: string) => {
  const ctx = await getRequestContext()
  const result = await calendarService.removeEvent(ctx, id)
  await revalidateOrgPath(ctx.organizationId, "/calendars")
  return result
})

export const addCalendarAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(createCalendarSchema, input)
  const calendar = await calendarService.addCalendar(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/calendars")
  return calendar
})

export const toggleCalendarAction = withAction(
  async (id: string, visible?: boolean) => {
    const ctx = await getRequestContext()
    const calendar = await calendarService.toggleCalendar(ctx, id, visible)
    await revalidateOrgPath(ctx.organizationId, "/calendars")
    return calendar
  }
)

export const respondToEventAction = withAction(
  async (eventId: string, input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(setAttendeeResponseSchema, input)
    const event = await calendarService.setAttendeeResponse(
      ctx,
      eventId,
      parsed
    )
    await revalidateOrgPath(ctx.organizationId, "/calendars")
    return event
  }
)
