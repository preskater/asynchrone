"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"
import { submitFeedback } from "@/lib/feedback"
import { submitFeedbackSchema } from "@/lib/feedback/schemas"

export const submitFeedbackAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(submitFeedbackSchema, input)
  return submitFeedback(ctx, parsed)
})
