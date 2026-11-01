import { NextResponse } from "next/server"

import { processExports } from "@/lib/organization/export-service"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Builds pending organization data exports and unlinks expired archives.
 * Called by the scheduled Kubernetes CronJob and guarded with `CRON_SECRET`
 * when configured. Idempotent: each export is claimed before it is built.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const authorization = request.headers.get("authorization")
    if (authorization !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 })
    }
  }

  const result = await processExports()
  return NextResponse.json({ ok: true, ...result })
}
