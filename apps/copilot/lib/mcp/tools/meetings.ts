import { meetingService } from "@/lib/meetings"
import {
  acceptMeetingRequestSchema,
  declineMeetingRequestSchema,
  updateMeetingSettingsSchema,
} from "@workspace/meetings/schemas"

import type { McpTool } from "./projects"

export const meetingTools: McpTool[] = [
  {
    name: "list_meeting_requests",
    title: "List meeting requests",
    description:
      "List client meeting proposals with their slots (each flagged when it overlaps another meeting) and the booking rules.",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => meetingService.listRequests(ctx),
  },
  {
    name: "accept_meeting_request",
    title: "Accept meeting request",
    description:
      "Accept a pending client meeting request by choosing one of its proposed slots (`slotId`). Books a team calendar event, notifies the client and returns the updated request.",
    inputSchema: acceptMeetingRequestSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      meetingService.acceptRequest(
        ctx,
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
      meetingService.declineRequest(
        ctx,
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
    run: (ctx) => meetingService.getSettings(ctx),
  },
  {
    name: "update_meeting_settings",
    title: "Update meeting settings",
    description:
      "Update the organization meeting booking rules. Owners and admins only.",
    inputSchema: updateMeetingSettingsSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      meetingService.updateSettings(
        ctx,
        updateMeetingSettingsSchema.parse(input)
      ),
  },
]
