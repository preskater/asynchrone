import { z } from "zod"

import { calendarService } from "@/lib/calendars"
import { createEventSchema } from "@workspace/calendars/schemas"
import type { RequestContext } from "@workspace/core/context"

import type { McpTool } from "./projects"

export const calendarTools: McpTool[] = [
  {
    name: "list_calendar",
    title: "List calendars and events",
    description: "List the workspace calendars and their scheduled events.",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => calendarService.list(ctx),
  },
  {
    name: "create_event",
    title: "Create calendar event",
    description:
      "Schedule a new calendar event. Attendees are member ids; startAt/endAt are ISO timestamps.",
    inputSchema: createEventSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      calendarService.createEvent(ctx, createEventSchema.parse(input)),
  },
  {
    name: "respond_to_event",
    title: "Respond to event",
    description:
      "Set your response (accepted, tentative, declined) for an event.",
    inputSchema: {
      eventId: z.string(),
      response: z.enum(["accepted", "tentative", "declined", "pending"]),
    },
    readOnly: false,
    run: (ctx, input) =>
      calendarService.setAttendeeResponse(ctx, String(input.eventId), {
        response: input.response as
          "accepted" | "tentative" | "declined" | "pending",
      }),
  },
]

export type { RequestContext }
