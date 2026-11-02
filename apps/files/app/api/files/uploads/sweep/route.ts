import { NextResponse } from "next/server"

import { createCronRoute } from "@workspace/observability/next"

import { filesRuntime } from "@/lib/files"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Removes large objects for upload sessions that were never completed.
 *
 * The Kubernetes CronJob calls it daily at 03:00 with
 * `Authorization: Bearer $CRON_SECRET` (the files chart owns the job since
 * #161). Unfinished uploads are also swept opportunistically when a new session
 * starts, so a missed run never leaks for long.
 */
export const GET = createCronRoute(
  { app: "files", job: "uploads-sweep" },
  async (request): Promise<NextResponse> => {
    const secret = process.env.CRON_SECRET
    if (secret) {
      const authorization = request.headers.get("authorization")
      if (authorization !== `Bearer ${secret}`) {
        return new NextResponse("Unauthorized", { status: 401 })
      }
    }

    await filesRuntime.uploads.sweepExpiredUploadSessions()
    return NextResponse.json({ ok: true })
  }
)
