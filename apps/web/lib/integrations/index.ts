import { prisma } from "@/lib/prisma"

import {
  RepositoryConnectionRepository,
  RepositoryIntegrationService,
  RepositoryWebhookHandler,
} from "@workspace/projects/integrations"

/**
 * App adapter for the projects repository integration.
 *
 * The connection, encrypted tokens and sync state belong to the projects
 * domain; this file only binds the shared client and the deployment origin
 * used to build the webhook URLs.
 */
export const repositoryConnectionRepository =
  new RepositoryConnectionRepository(prisma)

export const repositoryIntegrationService = new RepositoryIntegrationService(
  repositoryConnectionRepository,
  prisma,
  { appBaseUrl: process.env.BETTER_AUTH_URL ?? "" }
)

export const repositoryWebhookHandler = new RepositoryWebhookHandler(
  repositoryConnectionRepository,
  prisma
)

export {
  RepositoryConnectionRepository,
  RepositoryIntegrationService,
  RepositoryWebhookHandler,
}
export * from "@workspace/projects/integrations/schemas"
export {
  REPOSITORY_PROVIDERS,
  repositoryProviderLabel,
} from "@workspace/projects/integrations/types"
export type {
  ConnectRepositoryInput,
  ConnectRepositoryResult,
  RepositoryConnectionView,
  RepositoryProvider,
  RepositorySyncSummary,
  SetUserRepositoryTokenInput,
  TaskExternalLink,
  UserRepositoryTokenStatus,
} from "@workspace/projects/integrations/types"
