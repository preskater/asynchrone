import { NextResponse } from "next/server"

import { createCronRoute } from "@workspace/observability/next"

import { processOrganizationDeletions } from "@/lib/organization/deletion-service"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Daily job that deletes organizations whose 30-day grace period has passed,
 * including their file large objects. Called by the scheduled Kubernetes
 * CronJob and guarded with `CRON_SECRET` when configured. Idempotent: a run
 * that stops halfway is finished by the next one.
 */
export const GET = createCronRoute(
  { app: "copilot", job: "organization-deletion" },
  async (request): Promise<NextResponse> => {
    const secret = process.env.CRON_SECRET
    if (secret) {
      const authorization = request.headers.get("authorization")
      if (authorization !== `Bearer ${secret}`) {
        return new NextResponse("Unauthorized", { status: 401 })
      }
    }

    const result = await processOrganizationDeletions()
    return NextResponse.json({ ok: true, ...result })
  }
)
