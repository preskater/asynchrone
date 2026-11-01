"use server"

import { withAction } from "@workspace/core/action"
import {
  acceptMeetingRequestSchema,
  declineMeetingRequestSchema,
  updateMeetingSettingsSchema,
} from "@workspace/meetings/schemas"

import { meetingService } from "@/lib/meetings"
import {
  getRequestContext,
  parseLocalized,
  revalidateOrgPath,
} from "@/lib/request-context"

// ---------------------------------------------------------------------------
// Team inbox & settings
//
// The client-portal request/cancel actions stay in Copilot: the portal owns the
// client session, and the portal renders on Copilot's host (#161 keeps the
// portal there). This app owns the team side of the same service.
// ---------------------------------------------------------------------------

export const getMeetingSettingsAction = withAction(async () => {
  const ctx = await getRequestContext()
  return meetingService.getSettings(ctx)
})

export const updateMeetingSettingsAction = withAction(
  async (input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(updateMeetingSettingsSchema, input)
    const settings = await meetingService.updateSettings(ctx, parsed)
    await revalidateOrgPath(ctx.organizationId)
    return settings
  }
)

export const listMeetingRequestsAction = withAction(async () => {
  const ctx = await getRequestContext()
  return meetingService.listRequests(ctx)
})

export const acceptMeetingRequestAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(acceptMeetingRequestSchema, input)
  const request = await meetingService.acceptRequest(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId)
  return request
})

export const declineMeetingRequestAction = withAction(
  async (input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(declineMeetingRequestSchema, input)
    const request = await meetingService.declineRequest(ctx, parsed)
    await revalidateOrgPath(ctx.organizationId)
    return request
  }
)
