import type { RequestContext } from "@workspace/core/context"
import { ForbiddenError, ValidationError } from "@workspace/core/errors"
import { toDateKey } from "../dates"
import { resolveClientAccess, type ClientAccess } from "../access"
import type { ClientsRepository } from "../repository"
import type {
  ClientActivityData,
  ClientData,
  ClientContactData,
  ClientDealData,
  ClientDocumentData,
  ClientFieldDefinitionData,
  ClientFieldEntity,
  ClientFieldValue,
  ClientFieldValues,
  ClientMemberOptionData,
  ClientPipelineData,
  ClientSystemEventData,
  ClientTimelineEntryData,
} from "../types"

export const DEFAULT_PIPELINE = {
  name: "Sales pipeline",
  stages: [
    { name: "Lead", type: "open" },
    { name: "Qualified", type: "open" },
    { name: "Proposal", type: "open" },
    { name: "Negotiation", type: "open" },
    { name: "Won", type: "won" },
    { name: "Lost", type: "lost" },
  ],
}

export type MemberRow = Awaited<
  ReturnType<ClientsRepository["listMembers"]>
>[number]
export type ClientRow = Awaited<
  ReturnType<ClientsRepository["listClients"]>
>[number]
export type ContactRow = Awaited<
  ReturnType<ClientsRepository["listContacts"]>
>[number]
export type PipelineRow = Awaited<
  ReturnType<ClientsRepository["listPipelines"]>
>[number]
export type DealRow = Awaited<
  ReturnType<ClientsRepository["listDeals"]>
>[number]
export type ActivityRow = Awaited<
  ReturnType<ClientsRepository["listActivities"]>
>[number]
export type FieldRow = Awaited<
  ReturnType<ClientsRepository["listFieldDefinitions"]>
>[number]
export type AuditRow = Awaited<
  ReturnType<ClientsRepository["listAuditForEntity"]>
>[number]
export type StageStatRow = Awaited<
  ReturnType<ClientsRepository["stageDealStats"]>
>[number]

export interface ClientStatMaps {
  contacts: Map<string, number>
  deals: Map<string, { count: number; value: number }>
  projects: Map<string, number>
}
export type DocumentRow = Awaited<
  ReturnType<ClientsRepository["listDocuments"]>
>[number]

export function requireEdit(access: ClientAccess) {
  if (access.canEdit) return
  throw new ForbiddenError("Your role cannot modify client records.", {
    code: "role_cannot_modify_clients",
  })
}

export function requireManage(access: ClientAccess) {
  if (access.canManage) return
  throw new ForbiddenError("Your role cannot manage client settings.", {
    code: "role_cannot_manage_clients",
  })
}

export function requireExport(access: ClientAccess) {
  if (access.canExport) return
  throw new ForbiddenError("Your role cannot export client records.", {
    code: "role_cannot_export_clients",
  })
}

export function text(value: string | null | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined
}

export function slugify(label: string): string {
  return (
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field"
  )
}

function stringDetails(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") out[key] = item
    if (typeof item === "number" || typeof item === "boolean") {
      out[key] = String(item)
    }
  }
  return out
}

export class ClientsServiceCore {
  constructor(protected readonly repo: ClientsRepository) {}

  protected accessFor(ctx: RequestContext): ClientAccess {
    return resolveClientAccess(ctx)
  }

  protected mapMembers(rows: MemberRow[]): ClientMemberOptionData[] {
    return rows.map((row) => ({
      id: row.userId,
      name: row.name,
      email: row.email,
    }))
  }

  protected nameById(memberRows: MemberRow[]): Map<string, string> {
    return new Map(memberRows.map((row) => [row.userId, row.name]))
  }

  protected mapFieldDefinition(row: FieldRow): ClientFieldDefinitionData {
    return {
      id: row.id,
      entity: row.entity as ClientFieldEntity,
      key: row.key,
      label: row.label,
      type: row.type as ClientFieldDefinitionData["type"],
      options: Array.isArray(row.options)
        ? (row.options as unknown[]).filter(
            (item): item is string => typeof item === "string"
          )
        : [],
      isRequired: row.isRequired,
      position: row.position,
    }
  }

  protected optionsOf(def: FieldRow): string[] {
    return Array.isArray(def.options)
      ? (def.options as unknown[]).filter(
          (item): item is string => typeof item === "string"
        )
      : []
  }

  protected mapDocument(
    row: DocumentRow,
    nameById: Map<string, string>
  ): ClientDocumentData {
    return {
      id: row.id,
      fileId: row.file.id,
      name: row.file.name,
      kind: row.file.kind,
      mimeType: text(row.file.mimeType),
      sizeBytes: row.file.sizeBytes ?? undefined,
      visibility: row.visibility as ClientDocumentData["visibility"],
      trashed: row.file.trashed,
      addedById: row.addedBy,
      addedByName: nameById.get(row.addedBy),
      createdAt: row.createdAt.toISOString(),
    }
  }

  protected async memberNameById(
    organizationId: string
  ): Promise<Map<string, string>> {
    return this.nameById(await this.repo.listMembers(organizationId))
  }

  protected coerceFieldValue(def: FieldRow, raw: unknown): ClientFieldValue {
    switch (def.type) {
      case "number": {
        if (raw === null || raw === undefined || raw === "") return null
        const parsed = typeof raw === "number" ? raw : Number(raw)
        if (!Number.isFinite(parsed)) {
          throw new ValidationError(`“${def.label}” must be a number.`)
        }
        return parsed
      }
      case "boolean":
        return raw === true || raw === "true"
      case "date": {
        if (raw === null || raw === undefined || raw === "") return null
        if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          throw new ValidationError(`“${def.label}” must be a date.`)
        }
        return raw
      }
      case "multiselect": {
        const list = Array.isArray(raw)
          ? raw.filter((item): item is string => typeof item === "string")
          : []
        const options = this.optionsOf(def)
        return list.filter((item) => options.includes(item))
      }
      case "select": {
        if (raw === null || raw === undefined || raw === "") return null
        const options = this.optionsOf(def)
        const value = String(raw)
        return options.includes(value) ? value : null
      }
      default: {
        if (raw === null || raw === undefined) return null
        const value = String(raw).trim()
        return value === "" ? null : value
      }
    }
  }

  /**
   * Keep only values for defined fields of the entity, coerce them by type and
   * enforce required fields.
   */
  protected normalizeCustomFields(
    defs: FieldRow[],
    entity: ClientFieldEntity,
    raw: unknown
  ): ClientFieldValues {
    const source =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {}
    const values: ClientFieldValues = {}
    for (const def of defs) {
      if (def.entity !== entity) continue
      const value = this.coerceFieldValue(def, source[def.key])
      const empty =
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      if (empty && def.isRequired) {
        throw new ValidationError(`“${def.label}” is required.`, undefined, {
          code: "custom_field_required",
          params: { field: def.label },
        })
      }
      values[def.key] = value
    }
    return values
  }

  protected mapClient(
    row: ClientRow,
    stats: {
      contactCount: number
      openDealCount: number
      openDealValue: number
      projectCount: number
    },
    ownerName?: string
  ): ClientData {
    return {
      id: row.id,
      name: row.name,
      status: row.status as ClientData["status"],
      contactEmail: text(row.contactEmail),
      industry: text(row.industry),
      website: text(row.website),
      phone: text(row.phone),
      address: text(row.address),
      description: text(row.description),
      source: text(row.source),
      ownerId: text(row.ownerId),
      ownerName,
      isActive: row.isActive,
      customFields: (row.customFields ?? {}) as ClientFieldValues,
      archivedAt: row.deletedAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...stats,
    }
  }

  protected mapContact(
    row: ContactRow,
    openDealCount: number,
    ownerName?: string
  ): ClientContactData {
    const fullName = `${row.firstName} ${row.lastName}`.trim()
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      fullName,
      email: text(row.email),
      phone: text(row.phone),
      jobTitle: text(row.jobTitle),
      notes: text(row.notes),
      ownerId: text(row.ownerId),
      ownerName,
      customFields: (row.customFields ?? {}) as ClientFieldValues,
      companies: row.companies.map((link) => ({
        clientId: link.clientId,
        clientName: link.client.name,
        jobTitle: text(link.jobTitle),
        isPrimary: link.isPrimary,
      })),
      archivedAt: row.deletedAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      openDealCount,
    }
  }

  protected mapDeal(row: DealRow, ownerName?: string): ClientDealData {
    return {
      id: row.id,
      name: row.name,
      clientId: text(row.clientId),
      clientName: row.client?.name,
      pipelineId: text(row.pipelineId),
      stageId: text(row.stageId),
      stageName: row.stage?.name,
      stageType: (row.stage?.type as ClientDealData["stageType"]) ?? undefined,
      amount: row.amount,
      currency: row.currency,
      probability: row.probability,
      status: row.status as ClientDealData["status"],
      expectedCloseDate: row.expectedCloseDate
        ? toDateKey(row.expectedCloseDate)
        : undefined,
      actualCloseDate: row.actualCloseDate
        ? toDateKey(row.actualCloseDate)
        : undefined,
      lossReason: text(row.lossReason),
      source: text(row.source),
      description: text(row.description),
      ownerId: text(row.ownerId),
      ownerName,
      position: row.position,
      customFields: (row.customFields ?? {}) as ClientFieldValues,
      archivedAt: row.deletedAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      contacts: row.contacts.map((link) => ({
        contactId: link.contact.id,
        name: `${link.contact.firstName} ${link.contact.lastName}`.trim(),
        email: text(link.contact.email),
        isPrimary: link.isPrimary,
      })),
    }
  }

  protected mapPipeline(
    row: PipelineRow,
    stageStats: Map<string, { count: number; value: number }>
  ): ClientPipelineData {
    const stages = [...row.stages].sort((a, b) => a.position - b.position)
    return {
      id: row.id,
      name: row.name,
      isDefault: row.isDefault,
      stages: stages.map((stage) => {
        const stats = stageStats.get(stage.id)
        return {
          id: stage.id,
          name: stage.name,
          position: stage.position,
          type: stage.type as ClientPipelineData["stages"][number]["type"],
          color: text(stage.color),
          dealCount: stats?.count ?? 0,
          totalValue: stats?.value ?? 0,
        }
      }),
    }
  }

  protected stageStatsMap(rows: StageStatRow[]) {
    return new Map(
      rows.map((row) => [
        row.stageId ?? "",
        { count: row._count._all, value: row._sum.amount ?? 0 },
      ])
    )
  }

  protected mapActivity(
    row: ActivityRow,
    nameById: Map<string, string>
  ): ClientActivityData {
    return {
      id: row.id,
      type: row.type as ClientActivityData["type"],
      subject: text(row.subject),
      body: row.body,
      occurredAt: row.occurredAt.toISOString(),
      authorId: row.authorId,
      authorName: nameById.get(row.authorId) ?? "—",
      clientId: text(row.clientId),
      contactId: text(row.contactId),
      dealId: text(row.dealId),
    }
  }

  protected mergeTimeline(
    activityRows: ActivityRow[],
    auditRows: AuditRow[],
    nameById: Map<string, string>
  ): ClientTimelineEntryData[] {
    const entries: ClientTimelineEntryData[] = [
      ...activityRows.map((row) => {
        const activity = this.mapActivity(row, nameById)
        return {
          id: `activity-${row.id}`,
          kind: "activity" as const,
          occurredAt: activity.occurredAt,
          activity,
        }
      }),
      ...auditRows.map((row) => {
        const system: ClientSystemEventData = {
          id: row.id,
          action: row.action,
          details: stringDetails(row.after),
          occurredAt: row.createdAt.toISOString(),
          authorName: nameById.get(row.actorId) ?? "—",
        }
        return {
          id: `system-${row.id}`,
          kind: "system" as const,
          occurredAt: system.occurredAt,
          system,
        }
      }),
    ]
    return entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  }

  /** Lazily seed a default pipeline the first time the client is opened. */
  protected async ensureDefaultPipeline(organizationId: string) {
    const existing = await this.repo.listPipelines(organizationId)
    if (existing.length > 0) return
    await this.repo.createPipeline(organizationId, {
      name: DEFAULT_PIPELINE.name,
      isDefault: true,
      stages: DEFAULT_PIPELINE.stages.map((stage, index) => ({
        ...stage,
        position: index,
      })),
    })
  }

  /** Counters shared by the list and detail pages, computed in the database. */
  protected async loadClientStatMaps(
    ctx: RequestContext
  ): Promise<ClientStatMaps> {
    const [contactCounts, dealCounts, projectCounts] = await Promise.all([
      this.repo.contactCountsByClient(ctx.organizationId),
      this.repo.openDealCountsByClient(ctx.organizationId),
      this.repo.projectCountsByClient(ctx),
    ])
    return {
      contacts: new Map(
        contactCounts.map((row) => [row.clientId, row._count._all])
      ),
      deals: new Map(
        dealCounts.map((row) => [
          row.clientId ?? "",
          { count: row._count._all, value: row._sum.amount ?? 0 },
        ])
      ),
      projects: new Map(
        projectCounts.map((row) => [row.clientId ?? "", row.count])
      ),
    }
  }

  protected async loadContactDealCounts(organizationId: string) {
    const rows = await this.repo.openDealCountsByContact(organizationId)
    return new Map(rows.map((row) => [row.contactId, row._count._all] as const))
  }

  protected clientStatsFrom(clientId: string, maps: ClientStatMaps) {
    return {
      contactCount: maps.contacts.get(clientId) ?? 0,
      openDealCount: maps.deals.get(clientId)?.count ?? 0,
      openDealValue: maps.deals.get(clientId)?.value ?? 0,
      projectCount: maps.projects.get(clientId) ?? 0,
    }
  }
}
