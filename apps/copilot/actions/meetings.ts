"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { UnauthorizedError } from "@workspace/core/errors"
import { parseLocalized } from "@/lib/core/validation-server"
import { meetingService } from "@/lib/meetings"
import {
  acceptMeetingRequestSchema,
  cancelMeetingRequestSchema,
  createMeetingRequestSchema,
  declineMeetingRequestSchema,
  updateMeetingSettingsSchema,
} from "@workspace/meetings/schemas"
import { revalidateOrgPath } from "@/lib/organization/paths"
import { getPortalContext } from "@/lib/portal/context"

// ---------------------------------------------------------------------------
// Client portal
// ---------------------------------------------------------------------------

export const createMeetingRequestAction = withAction(async (input: unknown) => {
  const ctx = await getPortalContext()
  if (!ctx) throw new UnauthorizedError()
  const parsed = await parseLocalized(createMeetingRequestSchema, input)
  return meetingService.createRequest(ctx, parsed)
})

export const cancelMeetingRequestAction = withAction(async (input: unknown) => {
  const ctx = await getPortalContext()
  if (!ctx) throw new UnauthorizedError()
  const parsed = await parseLocalized(cancelMeetingRequestSchema, input)
  return meetingService.cancelRequest(ctx, parsed.id)
})

// ---------------------------------------------------------------------------
// Team inbox & settings
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
    await revalidateOrgPath(ctx.organizationId, "/settings")
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
  await revalidateOrgPath(ctx.organizationId, "/calendars")
  return request
})

export const declineMeetingRequestAction = withAction(
  async (input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(declineMeetingRequestSchema, input)
    const request = await meetingService.declineRequest(ctx, parsed)
    await revalidateOrgPath(ctx.organizationId, "/calendars")
    return request
  }
)
