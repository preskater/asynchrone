import { appOrigin } from "@workspace/contracts/server"
import {
  RepositoryConnectionRepository,
  RepositoryIntegrationService,
} from "@workspace/projects/integrations"

import { prisma } from "@/lib/prisma"

/**
 * Repository sync adapter for the projects app.
 *
 * The connection, its encrypted token and the sync state belong to the
 * projects domain. The webhook URL is still served by Copilot (`/api/webhooks/
 * repositories/:id`) until #190, so it is built from Copilot's origin: existing
 * GitHub/GitLab deliveries keep working across the split.
 */
export const repositoryConnectionRepository =
  new RepositoryConnectionRepository(prisma)

export const repositoryIntegrationService = new RepositoryIntegrationService(
  repositoryConnectionRepository,
  prisma,
  { appBaseUrl: appOrigin("copilot") }
)

export { RepositoryConnectionRepository, RepositoryIntegrationService }
