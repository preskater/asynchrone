import type { OrgPlan } from "@workspace/core/plans"

/** One audit row as the settings page and the export render it. */
export interface AuditEntryView {
  id: string
  /** ISO timestamp. */
  createdAt: string
  actorId: string
  actorName: string | null
  actorEmail: string | null
  action: string
  entityType: string
  entityId: string
  entityLabel: string | null
  ipAddress: string | null
  userAgent: string | null
  before: unknown
  after: unknown
}

/** An app that could not be queried during a fan-out. */
export interface AuditUnavailableApp {
  app: string
  code: string
  message: string
}

export interface AuditPage {
  items: AuditEntryView[]
  nextCursor: string | null
  /** Rows matching the active filter, for the "12 480 events" header. */
  total: number
  /** True when at least one app could not be queried. */
  partial?: boolean
  unavailableApps?: AuditUnavailableApp[]
}

export interface AuditFacetOption {
  value: string
  count: number
}

export interface AuditActorOption {
  id: string
  name: string | null
}

export interface AuditFacets {
  actions: AuditFacetOption[]
  entityTypes: AuditFacetOption[]
  actors: AuditActorOption[]
  partial?: boolean
  unavailableApps?: AuditUnavailableApp[]
}

export type AuditExportFormat = "csv" | "json"

export interface AuditExport {
  filename: string
  contentType: string
  content: string
  count: number
  /** True when the filter matched more rows than {@link AUDIT_EXPORT_LIMIT}. */
  truncated: boolean
  partial?: boolean
  unavailableApps?: AuditUnavailableApp[]
}

export interface AuditRetentionView {
  plan: OrgPlan
  /** Days enforced right now. */
  days: number
  /** The plan default, before any Enterprise override. */
  planDays: number
  overrideDays: number | null
  canConfigure: boolean
  minDays: number
  maxDays: number
}
