import {
  AUDIT_EXPORT_LIMIT,
  AUDIT_RETENTION_DAYS,
  AUDIT_RETENTION_MAX_DAYS,
  AUDIT_RETENTION_MIN_DAYS,
  AuditReader,
  auditChanges,
  auditRetentionCutoff,
  normalizeRetentionDays,
  resolveAuditRetention,
  type AuditChange,
  type AuditEntryView,
  type AuditExport,
  type AuditExportFormat,
  type AuditFacets,
  type AuditFilter,
  type AuditPage,
  type AuditPageInput,
  type AuditRetentionView,
} from "@workspace/audit"
import type { PrismaClient } from "@workspace/db"

import { parseOrganizationMetadata } from "@workspace/app-shell/appearance-types"
import { toCsv } from "@workspace/core/csv"
import type { RequestContext } from "@workspace/core/context"
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@workspace/core/errors"
import { requireEntitlement } from "@/lib/organization/entitlements"
import { ROLE_RANK, roleRank } from "@workspace/organization/roles"
import { prisma } from "@/lib/prisma"

import { AUDIT_ACTIONS } from "./actions"
import {
  exportAuditAcrossApps,
  facetsAcrossApps,
  listAuditAcrossApps,
  type LocalAuditSource,
} from "./fanout"
import { recordUserAudit } from "./record"
import { auditRemotes } from "./remotes"

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Read access to the customer-facing audit trail: owners and admins of a
 * workspace whose plan includes it. Client-portal accounts never reach the
 * workspace, and members/viewers get a 403.
 */
export class AuditService {
  private readonly reader: AuditReader
  private readonly local: LocalAuditSource

  constructor(private readonly db: PrismaClient = prisma) {
    this.reader = new AuditReader(db, {
      actorLookup: async (ids) => {
        const users = await db.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true },
        })
        return new Map(
          users.map((user) => [user.id, { name: user.name, email: user.email }])
        )
      },
    })
    this.local = {
      list: (organizationId, input) => this.reader.list(organizationId, input),
      facets: (organizationId) => this.reader.facets(organizationId),
      export: (organizationId, filter, limit) =>
        this.reader.export(organizationId, filter, limit),
    }
  }

  private async planSource(organizationId: string) {
    const organization = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: {
        metadata: true,
        trialEndsAt: true,
        subscription: { select: { plan: true } },
      },
    })
    if (!organization) throw new NotFoundError("Organization")
    return {
      metadata: organization.metadata,
      trialEndsAt: organization.trialEndsAt,
      subscription: organization.subscription ?? null,
    }
  }

  /** Role first, so a member gets `forbidden` rather than an upsell. */
  private async requireRead(ctx: RequestContext): Promise<void> {
    if (roleRank(ctx.role) < ROLE_RANK.admin) {
      throw new ForbiddenError("Only owners and admins can read the audit log.")
    }
    await requireEntitlement(ctx.organizationId, "auditLog")
  }

  private async retentionFor(
    organizationId: string
  ): Promise<AuditRetentionView> {
    const retention = resolveAuditRetention(
      await this.planSource(organizationId)
    )
    return {
      plan: retention.plan,
      days: retention.days,
      planDays: AUDIT_RETENTION_DAYS[retention.plan],
      overrideDays: retention.overrideDays,
      canConfigure: retention.canConfigure,
      minDays: AUDIT_RETENTION_MIN_DAYS,
      maxDays: AUDIT_RETENTION_MAX_DAYS,
    }
  }

  async retention(ctx: RequestContext): Promise<AuditRetentionView> {
    await this.requireRead(ctx)
    return this.retentionFor(ctx.organizationId)
  }

  async list(ctx: RequestContext, input: AuditPageInput): Promise<AuditPage> {
    await this.requireRead(ctx)
    return listAuditAcrossApps(
      ctx.organizationId,
      input,
      this.local,
      auditRemotes()
    )
  }

  /** Distinct values of the filter dropdowns, within the retention window. */
  async facets(ctx: RequestContext): Promise<AuditFacets> {
    await this.requireRead(ctx)
    const retention = resolveAuditRetention(
      await this.planSource(ctx.organizationId)
    )
    const cutoff = auditRetentionCutoff(retention.days)
    return facetsAcrossApps(
      ctx.organizationId,
      {
        ...this.local,
        facets: (organizationId) => this.reader.facets(organizationId, cutoff),
      },
      auditRemotes(),
      cutoff
    )
  }

  /**
   * Export of the active filter. Capped at {@link AUDIT_EXPORT_LIMIT} rows; the
   * response says when it was truncated so the caller can warn the user.
   */
  async export(
    ctx: RequestContext,
    filter: AuditFilter,
    format: AuditExportFormat
  ): Promise<AuditExport> {
    await this.requireRead(ctx)
    const { entries, truncated, partial, unavailableApps } =
      await exportAuditAcrossApps(
        ctx.organizationId,
        filter,
        this.local,
        auditRemotes(),
        AUDIT_EXPORT_LIMIT
      )
    const today = dayKey(new Date())

    if (format === "json") {
      return {
        filename: `asynchrone-space-audit-${today}.json`,
        contentType: "application/json",
        content: JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            truncated,
            partial,
            unavailableApps,
            entries,
          },
          null,
          2
        ),
        count: entries.length,
        truncated,
        partial,
        unavailableApps,
      }
    }

    const csvRows: (string | number | null)[][] = [
      [
        "Timestamp",
        "Actor",
        "Actor email",
        "Action",
        "Target type",
        "Target id",
        "Target",
        "IP address",
        "User agent",
        "Changes",
      ],
    ]
    for (const entry of entries) {
      csvRows.push([
        entry.createdAt,
        entry.actorName ?? entry.actorId,
        entry.actorEmail ?? "",
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.entityLabel ?? "",
        entry.ipAddress ?? "",
        entry.userAgent ?? "",
        auditChanges(entry.before, entry.after)
          .map((change) => describeChange(change, entry))
          .join("; "),
      ])
    }

    return {
      filename: `asynchrone-space-audit-${today}.csv`,
      contentType: "text/csv; charset=utf-8",
      content: toCsv(csvRows),
      count: entries.length,
      truncated,
      partial,
      unavailableApps,
    }
  }

  /**
   * Sets the Enterprise retention override, in days; `null` clears it and falls
   * back to the plan default. Owners only: this is a compliance setting.
   */
  async setRetention(
    ctx: RequestContext,
    value: unknown
  ): Promise<AuditRetentionView> {
    await this.requireRead(ctx)
    if (roleRank(ctx.role) < ROLE_RANK.owner) {
      throw new ForbiddenError("Only an owner can change the audit retention.")
    }
    const current = await this.retentionFor(ctx.organizationId)
    if (!current.canConfigure) {
      throw new ForbiddenError("Audit retention is fixed on your plan.", {
        code: "upgrade_required",
      })
    }

    const hasValue = value !== null && value !== undefined && value !== ""
    const days = hasValue ? normalizeRetentionDays(value) : null
    if (hasValue && days === null) {
      throw new ValidationError("Retention must be a number of days.")
    }

    const organization = await this.db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { metadata: true },
    })
    if (!organization) throw new NotFoundError("Organization")

    const metadata = parseOrganizationMetadata(organization.metadata)
    if (days === null) {
      delete metadata.auditRetentionDays
    } else {
      metadata.auditRetentionDays = days
    }
    await this.db.organization.update({
      where: { id: ctx.organizationId },
      data: { metadata: JSON.stringify(metadata) },
    })

    await recordUserAudit(
      ctx,
      {
        action: AUDIT_ACTIONS.organizationAuditRetentionUpdated,
        entityType: "organization",
        entityId: ctx.organizationId,
        entityLabel: null,
        before: { retentionDays: current.days },
        after: { retentionDays: days ?? current.planDays },
      },
      this.db
    )

    return this.retentionFor(ctx.organizationId)
  }
}

function describeChange(change: AuditChange, entry: AuditEntryView): string {
  const label = change.field === "value" ? entry.entityType : change.field
  return `${label}: ${change.before ?? "—"} → ${change.after ?? "—"}`
}

export const auditService = new AuditService()
