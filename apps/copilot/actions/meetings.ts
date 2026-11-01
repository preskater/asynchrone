"use server"

import { withAction } from "@workspace/core/action"
import { UnauthorizedError } from "@workspace/core/errors"
import {
  cancelMeetingRequestSchema,
  createMeetingRequestSchema,
} from "@workspace/meetings/schemas"

import { parseLocalized } from "@/lib/core/validation-server"
import { meetingService } from "@/lib/meetings"
import { getPortalContext } from "@/lib/portal/context"

// ---------------------------------------------------------------------------
// Client portal
//
// The portal stays inside Copilot (`apps/copilot/app/[locale]/portal`), so the
// client-side meeting requests keep their actions here. The team inbox and the
// meeting settings moved to `apps/calendars` in #161.
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
