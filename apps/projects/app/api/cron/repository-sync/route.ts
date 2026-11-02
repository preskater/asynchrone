import { NextResponse } from "next/server"

import { createCronRoute } from "@workspace/observability/next"

import { repositoryIntegrationService } from "@/lib/integrations"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Safety net for missed webhooks: reconciles every repository connection with
 * its project tasks. Owned by the projects app since #168; the Kubernetes
 * CronJob calls it hourly with `Authorization: Bearer $CRON_SECRET` when the
 * secret is configured. Webhooks remain the primary sync path and are still
 * served by Copilot until #190.
 */
export const GET = createCronRoute(
  { app: "projects", job: "repository-sync" },
  async (request): Promise<NextResponse> => {
    const secret = process.env.CRON_SECRET
    if (secret) {
      const authorization = request.headers.get("authorization")
      if (authorization !== `Bearer ${secret}`) {
        return new NextResponse("Unauthorized", { status: 401 })
      }
    }

    const result = await repositoryIntegrationService.syncAllConnections()
    return NextResponse.json({ ok: true, ...result })
  }
)
