"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { setTwoFactorRequired } from "@/lib/organization/two-factor-policy"

export const setTwoFactorRequiredAction = withAction(
  async (required: boolean) => {
    const ctx = await getRequestContext()
    await setTwoFactorRequired(ctx, required === true)
  }
)
