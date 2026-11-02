import { NextResponse } from "next/server"

import { createCronRoute } from "@workspace/observability/next"

import { prisma } from "@/lib/prisma"
import { deleteOrganizationAcrossApps } from "@/lib/sagas/service"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Daily job that deletes organizations whose 30-day grace period has passed.
 *
 * The cross-database saga deletes each domain app's rows and unlinks its large
 * objects first; identity is deleted only when every app completed. A partial
 * run keeps the organization and is resumed by the next run. Called by the
 * scheduled Kubernetes CronJob and guarded with `CRON_SECRET` when configured.
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

    const now = new Date()
    const due = await prisma.organization.findMany({
      where: { deletionScheduledAt: { lte: now } },
      select: { id: true },
    })

    const results: { organizationId: string; status: string }[] = []
    let deleted = 0
    for (const { id } of due) {
      const result = await deleteOrganizationAcrossApps(id, null, now)
      const status =
        "status" in result ? result.status : result.deleted ? "completed" : "skipped"
      if (status === "completed") deleted++
      results.push({ organizationId: id, status })
    }

    return NextResponse.json({ ok: true, deleted, results })
  }
)
