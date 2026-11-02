import { NextResponse } from "next/server"

import { createCronRoute } from "@workspace/observability/next"

import { processTrials } from "@/lib/organization/trial-service"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Daily Team trial job (D-3 reminder, expiry at `trialEndsAt`). Called by the
 * scheduled Kubernetes CronJob and guarded with `CRON_SECRET` when configured.
 * Idempotent: a second run the same day changes nothing.
 */
export const GET = createCronRoute(
  { app: "copilot", job: "trial-expiry" },
  async (request): Promise<NextResponse> => {
    const secret = process.env.CRON_SECRET
    if (secret) {
      const authorization = request.headers.get("authorization")
      if (authorization !== `Bearer ${secret}`) {
        return new NextResponse("Unauthorized", { status: 401 })
      }
    }

    const result = await processTrials()
    return NextResponse.json({ ok: true, ...result })
  }
)
