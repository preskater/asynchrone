"use server"

import { z } from "zod"
import type { MeetingRequestData } from "@workspace/meetings/types"

import { withAction } from "@workspace/core/action"
import { UnauthorizedError } from "@workspace/core/errors"
import {
  cancelMeetingRequestSchema,
  createMeetingRequestSchema,
} from "@workspace/meetings/schemas"

import { parseLocalized } from "@/lib/core/validation-server"
import {
  callDomain,
  delegatedPortalContext,
} from "@/lib/internal/domain"
import { getPortalContext } from "@/lib/portal/context"

// ---------------------------------------------------------------------------
// Client portal
//
// The portal stays inside Copilot (`apps/copilot/app/[locale]/portal`), so the
// client-side meeting requests keep their actions here. The calendars app owns
// the meeting rows and applies its own client-scope rules.
// ---------------------------------------------------------------------------

export const createMeetingRequestAction = withAction(async (input: unknown) => {
  const ctx = await getPortalContext()
  if (!ctx) throw new UnauthorizedError()
  const parsed = await parseLocalized(createMeetingRequestSchema, input)
  return callDomain(
    "calendars",
    "portal-create-meeting",
    delegatedPortalContext(ctx),
    parsed,
    z.unknown() as unknown as z.ZodType<MeetingRequestData>
  )
})

export const cancelMeetingRequestAction = withAction(async (input: unknown) => {
  const ctx = await getPortalContext()
  if (!ctx) throw new UnauthorizedError()
  const parsed = await parseLocalized(cancelMeetingRequestSchema, input)
  return callDomain(
    "calendars",
    "portal-cancel-meeting",
    delegatedPortalContext(ctx),
    parsed,
    z.unknown() as unknown as z.ZodType<MeetingRequestData>
  )
})
