import { z } from "zod"

import { callDomain, delegatedContext } from "@/lib/internal/domain"
import {
  acceptMeetingRequestSchema,
  declineMeetingRequestSchema,
  updateMeetingSettingsSchema,
} from "@workspace/meetings/schemas"

import type { McpTool } from "./projects"

const result = z.unknown()

function call(
  ctx: Parameters<McpTool["run"]>[0],
  operation:
    | "list-meeting-requests"
    | "accept-meeting-request"
    | "decline-meeting-request"
    | "get-meeting-settings"
    | "update-meeting-settings",
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

export const meetingTools: McpTool[] = [
  {
    name: "list_meeting_requests",
    title: "List meeting requests",
    description:
      "List client meeting proposals with their slots (each flagged when it overlaps another meeting) and the booking rules.",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => call(ctx, "list-meeting-requests", {}),
  },
  {
    name: "accept_meeting_request",
    title: "Accept meeting request",
    description:
      "Accept a pending client meeting request by choosing one of its proposed slots (`slotId`). Books a team calendar event, notifies the client and returns the updated request.",
    inputSchema: acceptMeetingRequestSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(
        ctx,
        "accept-meeting-request",
        acceptMeetingRequestSchema.parse(input)
      ),
  },
  {
    name: "decline_meeting_request",
    title: "Decline meeting request",
    description:
      "Decline a pending client meeting request with an optional reason shown to the client.",
    inputSchema: declineMeetingRequestSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(
        ctx,
        "decline-meeting-request",
        declineMeetingRequestSchema.parse(input)
      ),
  },
  {
    name: "get_meeting_settings",
    title: "Get meeting settings",
    description:
      "Read the organization meeting booking rules (client requests, overlaps, window, notice, provider).",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => call(ctx, "get-meeting-settings", {}),
  },
  {
    name: "update_meeting_settings",
    title: "Update meeting settings",
    description:
      "Update the organization meeting booking rules. Owners and admins only.",
    inputSchema: updateMeetingSettingsSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(
        ctx,
        "update-meeting-settings",
        updateMeetingSettingsSchema.parse(input)
      ),
  },
]
