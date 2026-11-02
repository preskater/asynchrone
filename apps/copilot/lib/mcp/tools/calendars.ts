import { z } from "zod"

import { callDomain, delegatedContext } from "@/lib/internal/domain"
import { createEventSchema } from "@workspace/calendars/schemas"
import type { RequestContext } from "@workspace/core/context"

import type { McpTool } from "./projects"

const result = z.unknown()

function call(
  ctx: RequestContext,
  operation: "list-calendars" | "create-event" | "respond-to-event",
  input: unknown
) {
  return callDomain(
    "calendars",
    operation,
    delegatedContext(ctx),
    input,
    result
  )
}

export const calendarTools: McpTool[] = [
  {
    name: "list_calendar",
    title: "List calendars and events",
    description: "List the workspace calendars and their scheduled events.",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => call(ctx, "list-calendars", {}),
  },
  {
    name: "create_event",
    title: "Create calendar event",
    description:
      "Schedule a new calendar event. Attendees are member ids; startAt/endAt are ISO timestamps.",
    inputSchema: createEventSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "create-event", createEventSchema.parse(input)),
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
      call(ctx, "respond-to-event", {
        eventId: String(input.eventId),
        response: input.response,
      }),
  },
]

export type { RequestContext }
