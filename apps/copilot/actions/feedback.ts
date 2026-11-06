"use server"

import { cookies } from "next/headers"

import { withAction } from "@workspace/core/action"
import { CORRELATION_COOKIE, isCorrelationId } from "@workspace/observability"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"
import { submitFeedback } from "@/lib/feedback"
import { submitFeedbackSchema } from "@/lib/feedback/schemas"

export const submitFeedbackAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(submitFeedbackSchema, input)
  // The proxy adopted `?rid=` from the help link, so this is the id of the
  // flow the user was in when they asked for help.
  const rid = (await cookies()).get(CORRELATION_COOKIE)?.value
  return submitFeedback(ctx, parsed, {
    requestId: isCorrelationId(rid) ? rid : null,
  })
})
