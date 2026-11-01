import { NextResponse } from "next/server"

import { filesRuntime } from "@/lib/files"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Removes large objects for upload sessions that were never completed. Safe to
 * call from the scheduled Kubernetes CronJob; guard with `CRON_SECRET` when
 * configured. Unfinished uploads are also swept opportunistically when a new
 * session starts.
 */
export async function GET(request: Request): Promise<NextResponse> {
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
