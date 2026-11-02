import { appOrigin } from "@workspace/contracts/server"
import {
  RepositoryConnectionRepository,
  RepositoryIntegrationService,
  RepositoryWebhookHandler,
} from "@workspace/projects/integrations"

import { identity } from "@/lib/identity"
import { prisma } from "@/lib/prisma"

/**
 * Repository sync adapter for the projects app.
 *
 * The connection, its encrypted token and the sync state belong to the
 * projects domain. The webhook endpoint is served by this app, and the linked
 * OAuth token is read from Copilot's identity API (the `account` table is not
 * in the projects database).
 */
export const repositoryConnectionRepository =
  new RepositoryConnectionRepository(prisma)

export const repositoryIntegrationService = new RepositoryIntegrationService(
  repositoryConnectionRepository,
  prisma,
  {
    appBaseUrl: appOrigin("projects"),
    accountToken: async (userId, provider) =>
      (await identity.getIntegrationToken(userId, provider)).accessToken,
  }
)

/** GitHub/GitLab deliveries are received by the projects app now. */
export const repositoryWebhookHandler = new RepositoryWebhookHandler(
  repositoryConnectionRepository,
  prisma
)

export {
  RepositoryConnectionRepository,
  RepositoryIntegrationService,
  RepositoryWebhookHandler,
}
