import { z } from "zod"

import type {
  DelegatedContext,
  DomainCall,
  DomainOperation,
} from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { rolesFrom } from "@workspace/core/roles"
import { ForbiddenError } from "@workspace/core/errors"
import { createEventSchema } from "@workspace/calendars/schemas"
import {
  acceptMeetingRequestSchema,
  createMeetingRequestSchema,
  declineMeetingRequestSchema,
  updateMeetingSettingsSchema,
} from "@workspace/meetings/schemas"

import { calendarService } from "@/lib/calendars"
import { meetingService } from "@/lib/meetings"

function requestContext(context: DelegatedContext): RequestContext {
  return {
    userId: context.userId,
    userName: context.userName,
    userEmail: context.userEmail,
    organizationId: context.organizationId,
    roles: rolesFrom(context),
  }
}

const eventInput = z.object({
  eventId: z.string().min(1),
  response: z.enum(["accepted", "tentative", "declined", "pending"]),
})

export async function dispatchDomain(
  operation: DomainOperation,
  call: DomainCall
): Promise<unknown> {
  const ctx = requestContext(call.context)

  switch (operation) {
    case "list-calendars":
      return calendarService.list(ctx)
    case "ensure-personal-calendar":
      return calendarService.listShell(ctx)
    case "create-event":
      return calendarService.createEvent(
        ctx,
        createEventSchema.parse(call.input)
      )
    case "respond-to-event": {
      const input = eventInput.parse(call.input)
      return calendarService.setAttendeeResponse(ctx, input.eventId, {
        response: input.response,
      })
    }
    case "list-meeting-requests":
      return meetingService.listRequests(ctx)
    case "accept-meeting-request":
      return meetingService.acceptRequest(
        ctx,
        acceptMeetingRequestSchema.parse(call.input)
      )
    case "decline-meeting-request":
      return meetingService.declineRequest(
        ctx,
        declineMeetingRequestSchema.parse(call.input)
      )
    case "get-meeting-settings":
      return meetingService.getSettings(ctx)
    case "update-meeting-settings":
      return meetingService.updateSettings(
        ctx,
        updateMeetingSettingsSchema.parse(call.input)
      )
    case "portal-create-meeting": {
      const portal = call.context.portal
      if (!portal)
        throw new ForbiddenError("A portal client context is required.")
      return meetingService.createRequest(
        {
          userId: ctx.userId,
          userName: ctx.userName,
          organizationId: ctx.organizationId,
          clientId: portal.clientId,
          clientName: portal.clientName,
        },
        createMeetingRequestSchema.parse(call.input)
      )
    }
    case "portal-cancel-meeting": {
      const portal = call.context.portal
      if (!portal)
        throw new ForbiddenError("A portal client context is required.")
      const input = z.object({ id: z.string().min(1) }).parse(call.input)
      return meetingService.cancelRequest(
        {
          userId: ctx.userId,
          userName: ctx.userName,
          organizationId: ctx.organizationId,
          clientId: portal.clientId,
          clientName: portal.clientName,
        },
        input.id
      )
    }
    case "portal-get-meetings": {
      const portal = call.context.portal
      if (!portal)
        throw new ForbiddenError("A portal client context is required.")
      return meetingService.getPortalMeetings({
        userId: ctx.userId,
        userName: ctx.userName,
        organizationId: ctx.organizationId,
        clientId: portal.clientId,
        clientName: portal.clientName,
      })
    }
    default:
      throw new ForbiddenError("This operation is not available on calendars.")
  }
}
