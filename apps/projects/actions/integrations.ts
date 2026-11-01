"use server"

import { withAction } from "@workspace/core/action"
import {
  getRequestContext,
  parseLocalized,
  revalidateOrgPath,
} from "@/lib/request-context"
import { repositoryIntegrationService } from "@/lib/integrations"
import { connectRepositorySchema } from "@workspace/projects/integrations/schemas"

/**
 * Repository sync actions for the project settings screen.
 *
 * Personal repository tokens are managed from Copilot's account settings, so
 * only the project-scoped operations and the read-only token status live here.
 */

export const getRepositoryConnectionAction = withAction(
  async (projectId: string) => {
    const ctx = await getRequestContext()
    return repositoryIntegrationService.getConnection(ctx, projectId)
  }
)

export const connectRepositoryAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(connectRepositorySchema, input)
  const result = await repositoryIntegrationService.connect(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId)
  return result
})

export const disconnectRepositoryAction = withAction(
  async (projectId: string) => {
    const ctx = await getRequestContext()
    const result = await repositoryIntegrationService.disconnect(ctx, projectId)
    await revalidateOrgPath(ctx.organizationId)
    return result
  }
)

export const syncRepositoryAction = withAction(async (projectId: string) => {
  const ctx = await getRequestContext()
  const summary = await repositoryIntegrationService.sync(ctx, projectId)
  await revalidateOrgPath(ctx.organizationId)
  return summary
})

/** Which providers the user has saved a personal token for. */
export const listUserRepositoryTokensAction = withAction(async () => {
  const ctx = await getRequestContext()
  return repositoryIntegrationService.listUserTokens(ctx)
})
