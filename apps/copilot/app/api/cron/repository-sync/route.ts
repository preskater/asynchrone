import { NextResponse } from "next/server"

import { repositoryIntegrationService } from "@/lib/integrations"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Safety net for missed webhooks: reconciles every repository connection with
 * its project tasks. Safe to call from the scheduled Kubernetes CronJob
 * (guarded with `CRON_SECRET` when configured); webhooks remain the primary
 * sync path.
 */
export async function GET(request: Request): Promise<NextResponse> {
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
