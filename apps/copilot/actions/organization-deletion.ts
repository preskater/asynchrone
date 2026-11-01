"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import {
  cancelOrganizationDeletion,
  requestOrganizationDeletion,
} from "@/lib/organization/deletion-service"

export const requestOrganizationDeletionAction = withAction(
  async (confirmName: string) => {
    const ctx = await getRequestContext()
    return requestOrganizationDeletion(ctx, confirmName)
  }
)

export const cancelOrganizationDeletionAction = withAction(async () => {
  const ctx = await getRequestContext()
  await cancelOrganizationDeletion(ctx)
})
