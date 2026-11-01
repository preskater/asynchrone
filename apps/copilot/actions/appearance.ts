"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"

import { organizationAppearanceSchema } from "@workspace/appearance/schemas"
import { updateOrganizationAppearance } from "@/lib/appearance/service"

export const updateOrganizationAppearanceAction = withAction(
  async (input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(organizationAppearanceSchema, input)
    return updateOrganizationAppearance(ctx, parsed)
  }
)
