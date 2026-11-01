import { auditRetentionCutoff, resolveAuditRetention } from "@workspace/audit"
import { prisma } from "@workspace/db-identity"

import {
  pruneAuditAcrossApps,
  type AuditPruneTarget,
  type PruneAcrossAppsResult,
} from "@workspace/audit"
import { auditRemotes } from "./remotes"

const ORG_PAGE_SIZE = 100

interface OrgRow {
  id: string
  metadata: string | null
  trialEndsAt: Date | null
  subscription: { plan: string } | null
}

/**
 * Retention fan-out: compute every organization's plan cutoff in the identity
 * database, then ask each domain app to delete its own expired rows. The
 * identity app's rows are handled by `pruneAuditLogs`, which runs first in the
 * cron route.
 */
export async function pruneRemoteAuditLogs(
  now = new Date()
): Promise<PruneAcrossAppsResult> {
  const remotes = auditRemotes()
  if (remotes.length === 0) {
    return {
      organizations: 0,
      deleted: 0,
      capped: 0,
      unavailableApps: [],
    }
  }

  const targets: AuditPruneTarget[] = []
  let cursorId: string | null = null
  for (;;) {
    const organizations: OrgRow[] = await prisma.organization.findMany({
      select: {
        id: true,
        metadata: true,
        trialEndsAt: true,
        subscription: { select: { plan: true } },
      },
      orderBy: { id: "asc" },
      take: ORG_PAGE_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    })
    if (organizations.length === 0) break
    cursorId = organizations[organizations.length - 1]?.id ?? null

    for (const organization of organizations) {
      const retention = resolveAuditRetention(
        {
          metadata: organization.metadata,
          trialEndsAt: organization.trialEndsAt,
          subscription: organization.subscription ?? null,
        },
        now
      )
      targets.push({
        organizationId: organization.id,
        before: auditRetentionCutoff(retention.days, now).toISOString(),
      })
    }

    if (organizations.length < ORG_PAGE_SIZE) break
  }

  return pruneAuditAcrossApps(targets, remotes)
}
