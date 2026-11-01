import { NextResponse } from "next/server"

import { pruneAuditLogs } from "@/lib/audit/prune"
import { pruneRemoteAuditLogs } from "@/lib/audit/remote-prune"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Daily audit-log retention job. Called by the scheduled Kubernetes CronJob and
 * guarded with `CRON_SECRET` when configured.
 *
 * Each organization keeps rows for its plan's window (30 days on Starter, 12
 * months on Team, an Enterprise default overridable per workspace) and loses
 * everything older. `PlatformAuditEvent` is never touched. Idempotent, and it
 * leaves a large backlog for the next run instead of locking the table.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const authorization = request.headers.get("authorization")
    if (authorization !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 })
    }
  }

  const local = await pruneAuditLogs()
  const remote = await pruneRemoteAuditLogs()
  return NextResponse.json({ ok: true, local, remote })
}
