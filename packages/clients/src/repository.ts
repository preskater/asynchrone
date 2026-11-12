import type { RequestContext } from "@workspace/core/context"
import type { PrismaClient } from "@workspace/db-clients"

import type {
  ClientAudit,
  ClientAuditEntry,
  ClientFileRow,
  ClientRepositoryPorts,
  ClientTaskInput,
} from "./ports"

/** Columns selecting the company fields shared by every client query. */
const CLIENT_SELECT = {
  id: true,
  name: true,
  status: true,
  contactEmail: true,
  industry: true,
  website: true,
  phone: true,
  address: true,
  description: true,
  source: true,
  ownerId: true,
  isActive: true,
  customFields: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const

type ClientCursor = { name: string; id: string }
type ContactCursor = { lastName: string; firstName: string; id: string }
type DealCursor = { createdAt: Date; id: string }
type ActivityCursor = { occurredAt: Date; id: string }

export class ClientsRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly audit: ClientAudit,
    private readonly ports: ClientRepositoryPorts
  ) {}

  // --- Members ---------------------------------------------------------------

  async listMembers(organizationId: string) {
    const members = await this.ports.directory.list(organizationId)
    return members.filter((member) => member.clientId == null)
  }

  async memberExists(organizationId: string, userId: string) {
    const members = await this.ports.directory.list(organizationId)
    return members.find((member) => member.userId === userId) ?? null
  }

  // --- Companies (clients) -----------------------------------------------------

  listClients(organizationId: string) {
    return this.db.client.findMany({
      where: { organizationId },
      select: CLIENT_SELECT,
      orderBy: { name: "asc" },
    })
  }

  /** One keyset page ordered by `(name, id)` ascending. */
  listClientsPage(
    organizationId: string,
    options: { after?: ClientCursor | null; take: number }
  ) {
    return this.db.client.findMany({
      where: {
        organizationId,
        ...(options.after
          ? {
              OR: [
                { name: { gt: options.after.name } },
                { name: options.after.name, id: { gt: options.after.id } },
              ],
            }
          : {}),
      },
      select: CLIENT_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: options.take,
    })
  }

  listClientOptions(organizationId: string) {
    return this.db.client.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
  }

  clientStatusCounts(organizationId: string) {
    return this.db.client.groupBy({
      by: ["status"],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
    })
  }

  /** Contact counters per company without loading the contact rows. */
  contactCountsByClient(organizationId: string) {
    return this.db.contactCompany.groupBy({
      by: ["clientId"],
      where: {
        contact: { organizationId, deletedAt: null },
        client: { deletedAt: null },
      },
      _count: { _all: true },
    })
  }

  async projectCountsByClient(ctx: RequestContext) {
    return this.ports.projects.countsByClient(ctx)
  }

  clientContactCount(organizationId: string, clientId: string) {
    return this.db.contactCompany.count({
      where: { clientId, contact: { organizationId, deletedAt: null } },
    })
  }

  clientProjectCount(ctx: RequestContext, clientId: string) {
    return this.ports.projects.countForClient(ctx, clientId)
  }

  /** Open deal count/value per company (callers map by `clientId`). */
  openDealCountsByClient(organizationId: string) {
    return this.db.deal.groupBy({
      by: ["clientId"],
      where: {
        organizationId,
        deletedAt: null,
        status: "open",
        client: { deletedAt: null },
      },
      _count: { _all: true },
      _sum: { amount: true },
    })
  }

  clientOpenDealStats(organizationId: string, clientId: string) {
    return this.db.deal.aggregate({
      where: {
        organizationId,
        clientId,
        deletedAt: null,
        status: "open",
      },
      _count: { _all: true },
      _sum: { amount: true },
    })
  }

  /** Open deal count per contact. */
  openDealCountsByContact(organizationId: string) {
    return this.db.dealContact.groupBy({
      by: ["contactId"],
      where: {
        deal: { organizationId, deletedAt: null, status: "open" },
      },
      _count: { _all: true },
    })
  }

  /** Global deal KPIs for the deals page (pagination-safe). */
  async dealStats(organizationId: string, wonSince: Date) {
    const [open, won] = await Promise.all([
      this.db.$queryRaw<{ count: number; value: number; weighted: number }[]>`
        SELECT COUNT(*)::int AS count,
               COALESCE(SUM(amount), 0)::float AS value,
               COALESCE(SUM(amount * probability / 100.0), 0)::float AS weighted
        FROM "deal"
        WHERE "organizationId" = ${organizationId}
          AND status = 'open'
          AND "deletedAt" IS NULL
      `,
      this.db.deal.aggregate({
        where: {
          organizationId,
          status: "won",
          deletedAt: null,
          actualCloseDate: { gte: wonSince },
        },
        _sum: { amount: true },
      }),
    ])
    const row = open[0]
    return {
      openCount: row?.count ?? 0,
      openValue: row?.value ?? 0,
      weighted: row?.weighted ?? 0,
      wonValue: won._sum.amount ?? 0,
    }
  }

  findClient(organizationId: string, id: string) {
    return this.db.client.findFirst({
      where: { id, organizationId },
      select: CLIENT_SELECT,
    })
  }

  clientExists(organizationId: string, id: string) {
    return this.db.client.findFirst({
      where: { id, organizationId },
      select: { id: true },
    })
  }

  findClientByName(organizationId: string, name: string) {
    return this.db.client.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true, name: true, deletedAt: true },
    })
  }

  createClient(data: {
    organizationId: string
    name: string
    status: string
    contactEmail?: string | null
    industry?: string | null
    website?: string | null
    phone?: string | null
    address?: string | null
    description?: string | null
    source?: string | null
    ownerId?: string | null
    isActive: boolean
    customFields?: unknown
  }) {
    return this.db.client.create({
      data: {
        ...data,
        customFields: (data.customFields ?? undefined) as never,
      },
      select: CLIENT_SELECT,
    })
  }

  updateClient(
    id: string,
    data: {
      name?: string
      status?: string
      contactEmail?: string | null
      industry?: string | null
      website?: string | null
      phone?: string | null
      address?: string | null
      description?: string | null
      source?: string | null
      ownerId?: string | null
      isActive?: boolean
      customFields?: unknown
    }
  ) {
    return this.db.client.update({
      where: { id },
      data: { ...data, customFields: data.customFields as never },
      select: CLIENT_SELECT,
    })
  }

  setClientArchived(id: string, deletedAt: Date | null) {
    return this.db.client.update({
      where: { id },
      data: { deletedAt },
      select: CLIENT_SELECT,
    })
  }

  /** Project options used for client detail pages and statistics. */
  listProjectOptions(ctx: RequestContext) {
    return this.ports.projects.listOptions(ctx)
  }

  createProjectTask(
    ctx: RequestContext,
    input: ClientTaskInput,
    idempotencyKey: string
  ) {
    return this.ports.projects.createTask(ctx, input, idempotencyKey)
  }

  findProject(ctx: RequestContext, id: string) {
    return this.ports.projects.find(ctx, id)
  }

  setProjectClient(ctx: RequestContext, id: string, clientId: string | null) {
    return this.ports.projects.setClient(ctx, id, clientId)
  }

  /** Projects with their current company, used by the client link picker. */
  listProjectLinkOptions(ctx: RequestContext) {
    return this.ports.projects.listLinkOptions(ctx)
  }

  // --- Contacts ----------------------------------------------------------------

  listContacts(organizationId: string) {
    return this.db.contact.findMany({
      where: { organizationId },
      include: {
        companies: {
          include: { client: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    })
  }

  /** One keyset page ordered by `(lastName, firstName, id)` ascending. */
  listContactsPage(
    organizationId: string,
    options: { after?: ContactCursor | null; take: number }
  ) {
    return this.db.contact.findMany({
      where: {
        organizationId,
        ...(options.after
          ? {
              OR: [
                { lastName: { gt: options.after.lastName } },
                {
                  lastName: options.after.lastName,
                  firstName: { gt: options.after.firstName },
                },
                {
                  lastName: options.after.lastName,
                  firstName: options.after.firstName,
                  id: { gt: options.after.id },
                },
              ],
            }
          : {}),
      },
      include: {
        companies: {
          include: { client: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: options.take,
    })
  }

  listContactOptions(organizationId: string) {
    return this.db.contact.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    })
  }

  /** Contacts attached to one company (detail page). */
  listContactsForClient(organizationId: string, clientId: string) {
    return this.db.contact.findMany({
      where: {
        organizationId,
        companies: { some: { clientId } },
      },
      include: {
        companies: {
          include: { client: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    })
  }

  findContact(organizationId: string, id: string) {
    return this.db.contact.findFirst({
      where: { id, organizationId },
      include: {
        companies: {
          include: { client: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    })
  }

  countContactsByIds(organizationId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve(0)
    return this.db.contact.count({
      where: { organizationId, deletedAt: null, id: { in: ids } },
    })
  }

  listContactEmails(organizationId: string) {
    return this.db.contact.findMany({
      where: { organizationId, email: { not: null } },
      select: { email: true },
    })
  }

  findContactByEmail(organizationId: string, email: string) {
    return this.db.contact.findFirst({
      where: {
        organizationId,
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true, firstName: true, lastName: true, deletedAt: true },
    })
  }

  createContact(
    data: {
      organizationId: string
      firstName: string
      lastName: string
      email?: string | null
      phone?: string | null
      jobTitle?: string | null
      notes?: string | null
      ownerId?: string | null
      customFields?: unknown
    },
    companies: {
      clientId: string
      jobTitle?: string | null
      isPrimary: boolean
    }[]
  ) {
    return this.db.contact.create({
      data: {
        ...data,
        customFields: data.customFields as never,
        companies: { create: companies },
      },
      include: { companies: { include: { client: true } } },
    })
  }

  updateContact(
    id: string,
    data: {
      firstName?: string
      lastName?: string
      email?: string | null
      phone?: string | null
      jobTitle?: string | null
      notes?: string | null
      ownerId?: string | null
      customFields?: unknown
    },
    companies?: {
      clientId: string
      jobTitle?: string | null
      isPrimary: boolean
    }[]
  ) {
    return this.db.contact.update({
      where: { id },
      data: {
        ...data,
        customFields: data.customFields as never,
        ...(companies
          ? { companies: { deleteMany: {}, create: companies } }
          : {}),
      },
      include: { companies: { include: { client: true } } },
    })
  }

  setContactArchived(id: string, deletedAt: Date | null) {
    return this.db.contact.update({
      where: { id },
      data: { deletedAt },
      include: { companies: { include: { client: true } } },
    })
  }

  // --- Pipelines & stages -------------------------------------------------------

  listPipelines(organizationId: string) {
    return this.db.pipeline.findMany({
      where: { organizationId },
      include: { stages: { orderBy: { position: "asc" } } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    })
  }

  /** Deal count/value per stage without loading every deal. */
  stageDealStats(organizationId: string) {
    return this.db.deal.groupBy({
      by: ["stageId"],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
      _sum: { amount: true },
    })
  }

  countDealsInStage(stageId: string) {
    return this.db.deal.count({ where: { stageId, deletedAt: null } })
  }

  countDealsInPipeline(pipelineId: string) {
    return this.db.deal.count({ where: { pipelineId, deletedAt: null } })
  }

  listDealPositions(stageId: string) {
    return this.db.deal.findMany({
      where: { stageId, deletedAt: null },
      select: { id: true, position: true },
      orderBy: { position: "asc" },
    })
  }

  listClientNames(organizationId: string) {
    return this.db.client.findMany({
      where: { organizationId },
      select: { id: true, name: true, deletedAt: true },
      orderBy: { name: "asc" },
    })
  }

  findPipeline(organizationId: string, id: string) {
    return this.db.pipeline.findFirst({ where: { id, organizationId } })
  }

  createPipeline(
    organizationId: string,
    data: {
      name: string
      isDefault: boolean
      stages: { name: string; type: string; position: number }[]
    }
  ) {
    return this.db.pipeline.create({
      data: {
        organizationId,
        name: data.name,
        isDefault: data.isDefault,
        stages: { create: data.stages },
      },
      include: { stages: { orderBy: { position: "asc" } } },
    })
  }

  updatePipeline(id: string, data: { name?: string; isDefault?: boolean }) {
    return this.db.pipeline.update({ where: { id }, data })
  }

  deletePipeline(id: string) {
    return this.db.pipeline.delete({ where: { id } })
  }

  setOnlyDefaultPipeline(organizationId: string, id: string) {
    return this.db.$transaction([
      this.db.pipeline.updateMany({
        where: { organizationId, id: { not: id } },
        data: { isDefault: false },
      }),
      this.db.pipeline.update({ where: { id }, data: { isDefault: true } }),
    ])
  }

  findStage(organizationId: string, id: string) {
    return this.db.pipelineStage.findFirst({
      where: { id, pipeline: { organizationId } },
      include: { pipeline: true },
    })
  }

  countStageDeals(stageId: string) {
    return this.db.deal.count({ where: { stageId, deletedAt: null } })
  }

  createStage(data: {
    pipelineId: string
    name: string
    type: string
    position: number
    color?: string | null
  }) {
    return this.db.pipelineStage.create({ data })
  }

  updateStage(
    id: string,
    data: {
      name?: string
      type?: string
      position?: number
      color?: string | null
    }
  ) {
    return this.db.pipelineStage.update({ where: { id }, data })
  }

  deleteStage(id: string) {
    return this.db.pipelineStage.delete({ where: { id } })
  }

  updateStagePositions(entries: { id: string; position: number }[]) {
    return this.db.$transaction(
      entries.map((entry) =>
        this.db.pipelineStage.update({
          where: { id: entry.id },
          data: { position: entry.position },
        })
      )
    )
  }

  // --- Deals ---------------------------------------------------------------------

  private static readonly DEAL_INCLUDE = {
    client: { select: { id: true, name: true } },
    stage: { select: { id: true, name: true, type: true } },
    pipeline: { select: { id: true, name: true } },
    contacts: {
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    },
  } as const

  listDeals(organizationId: string) {
    return this.db.deal.findMany({
      where: { organizationId },
      include: ClientsRepository.DEAL_INCLUDE,
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    })
  }

  /** One keyset page ordered by `(createdAt, id)` descending. */
  listDealsPage(
    organizationId: string,
    options: { after?: DealCursor | null; take: number }
  ) {
    return this.db.deal.findMany({
      where: {
        organizationId,
        ...(options.after
          ? {
              OR: [
                { createdAt: { lt: options.after.createdAt } },
                {
                  createdAt: options.after.createdAt,
                  id: { lt: options.after.id },
                },
              ],
            }
          : {}),
      },
      include: ClientsRepository.DEAL_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options.take,
    })
  }

  /** Projects linked to one company (detail page). */
  listProjectsForClient(ctx: RequestContext, clientId: string) {
    return this.ports.projects.listForClient(ctx, clientId)
  }

  /** Deals linked to one company. */
  listDealsByClient(organizationId: string, clientId: string) {
    return this.db.deal.findMany({
      where: { organizationId, clientId },
      include: ClientsRepository.DEAL_INCLUDE,
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    })
  }

  /** Deals linked to one contact (through the deal-contact join table). */
  listDealsByContact(organizationId: string, contactId: string) {
    return this.db.deal.findMany({
      where: { organizationId, contacts: { some: { contactId } } },
      include: ClientsRepository.DEAL_INCLUDE,
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    })
  }

  findDeal(organizationId: string, id: string) {
    return this.db.deal.findFirst({
      where: { id, organizationId },
      include: ClientsRepository.DEAL_INCLUDE,
    })
  }

  createDeal(
    data: {
      organizationId: string
      name: string
      clientId?: string | null
      pipelineId?: string | null
      stageId?: string | null
      amount: number
      currency: string
      probability: number
      expectedCloseDate?: Date | null
      source?: string | null
      description?: string | null
      ownerId?: string | null
      position: number
      customFields?: unknown
    },
    contactIds: string[]
  ) {
    return this.db.deal.create({
      data: {
        ...data,
        customFields: data.customFields as never,
        contacts: {
          create: contactIds.map((contactId, index) => ({
            contactId,
            isPrimary: index === 0,
          })),
        },
      },
      include: ClientsRepository.DEAL_INCLUDE,
    })
  }

  updateDeal(
    id: string,
    data: {
      name?: string
      clientId?: string | null
      pipelineId?: string | null
      stageId?: string | null
      amount?: number
      currency?: string
      probability?: number
      status?: string
      expectedCloseDate?: Date | null
      actualCloseDate?: Date | null
      lossReason?: string | null
      source?: string | null
      description?: string | null
      ownerId?: string | null
      position?: number
      customFields?: unknown
    },
    contactIds?: string[]
  ) {
    return this.db.deal.update({
      where: { id },
      data: {
        ...data,
        customFields: data.customFields as never,
        ...(contactIds
          ? {
              contacts: {
                deleteMany: {},
                create: contactIds.map((contactId, index) => ({
                  contactId,
                  isPrimary: index === 0,
                })),
              },
            }
          : {}),
      },
      include: ClientsRepository.DEAL_INCLUDE,
    })
  }

  setDealArchived(id: string, deletedAt: Date | null) {
    return this.db.deal.update({
      where: { id },
      data: { deletedAt },
      include: ClientsRepository.DEAL_INCLUDE,
    })
  }

  updateDealPositions(
    entries: { id: string; position: number; stageId?: string }[]
  ) {
    return this.db.$transaction(
      entries.map((entry) =>
        this.db.deal.update({
          where: { id: entry.id },
          data: {
            position: entry.position,
            ...(entry.stageId ? { stageId: entry.stageId } : {}),
          },
        })
      )
    )
  }

  // --- Activities ---------------------------------------------------------------

  listActivities(
    organizationId: string,
    options: { after?: ActivityCursor | null; take?: number } = {}
  ) {
    return this.db.clientActivity.findMany({
      where: {
        organizationId,
        ...(options.after
          ? {
              OR: [
                { occurredAt: { lt: options.after.occurredAt } },
                {
                  occurredAt: options.after.occurredAt,
                  id: { lt: options.after.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: options.take ?? 100,
    })
  }

  listActivitiesFor(
    organizationId: string,
    where: { clientId?: string; contactId?: string; dealId?: string },
    options: { after?: ActivityCursor | null; take?: number } = {}
  ) {
    return this.db.clientActivity.findMany({
      where: {
        organizationId,
        ...where,
        ...(options.after
          ? {
              OR: [
                { occurredAt: { lt: options.after.occurredAt } },
                {
                  occurredAt: options.after.occurredAt,
                  id: { lt: options.after.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: options.take ?? 50,
    })
  }

  createActivity(data: {
    organizationId: string
    type: string
    subject?: string | null
    body: string
    occurredAt: Date
    authorId: string
    clientId?: string | null
    contactId?: string | null
    dealId?: string | null
  }) {
    return this.db.clientActivity.create({ data })
  }

  // --- Custom field definitions ---------------------------------------------------

  listFieldDefinitions(organizationId: string) {
    return this.db.clientFieldDefinition.findMany({
      where: { organizationId },
      orderBy: [{ entity: "asc" }, { position: "asc" }],
    })
  }

  findFieldDefinition(organizationId: string, id: string) {
    return this.db.clientFieldDefinition.findFirst({
      where: { id, organizationId },
    })
  }

  findFieldDefinitionByKey(
    organizationId: string,
    entity: string,
    key: string
  ) {
    return this.db.clientFieldDefinition.findFirst({
      where: { organizationId, entity, key },
    })
  }

  createFieldDefinition(data: {
    organizationId: string
    entity: string
    key: string
    label: string
    type: string
    options?: unknown
    isRequired: boolean
    position: number
  }) {
    return this.db.clientFieldDefinition.create({
      data: { ...data, options: data.options as never },
    })
  }

  updateFieldDefinition(
    id: string,
    data: {
      label?: string
      type?: string
      options?: unknown
      isRequired?: boolean
      position?: number
    }
  ) {
    return this.db.clientFieldDefinition.update({
      where: { id },
      data: { ...data, options: data.options as never },
    })
  }

  deleteFieldDefinition(id: string) {
    return this.db.clientFieldDefinition.delete({ where: { id } })
  }

  // --- Documents ------------------------------------------------------------------

  /** Join the file metadata the files app owns onto document links. */
  private async withFiles<T extends { fileId: string }>(
    ctx: RequestContext,
    rows: T[]
  ): Promise<(T & { file: ClientFileRow })[]> {
    if (rows.length === 0) return []
    const files = await this.ports.files.byIds(
      ctx,
      rows.map((row) => row.fileId)
    )
    const byId = new Map(files.map((file) => [file.id, file]))
    return rows.flatMap((row) => {
      const file = byId.get(row.fileId)
      return file ? [{ ...row, file }] : []
    })
  }

  async listDocuments(ctx: RequestContext, entity: string, entityId: string) {
    const rows = await this.db.clientDocument.findMany({
      where: { organizationId: ctx.organizationId, entity, entityId },
      orderBy: { createdAt: "desc" },
    })
    return this.withFiles(ctx, rows)
  }

  async findDocument(ctx: RequestContext, id: string) {
    const row = await this.db.clientDocument.findFirst({
      where: { id, organizationId: ctx.organizationId },
    })
    if (!row) return null
    return (await this.withFiles(ctx, [row]))[0] ?? null
  }

  findDocumentLink(
    organizationId: string,
    fileId: string,
    entity: string,
    entityId: string
  ) {
    return this.db.clientDocument.findFirst({
      where: { organizationId, fileId, entity, entityId },
      select: { id: true },
    })
  }

  async createDocument(
    ctx: RequestContext,
    data: {
      fileId: string
      entity: string
      entityId: string
      visibility: string
      addedBy: string
    }
  ) {
    const row = await this.db.clientDocument.create({
      data: { ...data, organizationId: ctx.organizationId },
    })
    const withFile = (await this.withFiles(ctx, [row]))[0]
    if (!withFile) throw new Error("The linked file no longer exists")
    return withFile
  }

  async updateDocumentVisibility(
    ctx: RequestContext,
    id: string,
    visibility: string
  ) {
    const row = await this.db.clientDocument.update({
      where: { id },
      data: { visibility },
    })
    const withFile = (await this.withFiles(ctx, [row]))[0]
    if (!withFile) throw new Error("The linked file no longer exists")
    return withFile
  }

  deleteDocument(id: string) {
    return this.db.clientDocument.delete({ where: { id } })
  }

  findFileForLink(ctx: RequestContext, fileId: string) {
    return this.ports.files.find(ctx, fileId)
  }

  listFileOptions(ctx: RequestContext) {
    return this.ports.files.listOptions(ctx)
  }

  // --- Releases and test feedback (ADR 0040) ----------------------------------------

  // ponytail: no pagination; a company rarely has more than a few dozen
  // releases. Add a cursor when the cross-client page needs one.
  listReleases(
    organizationId: string,
    where: { clientId?: string; projectId?: string; id?: string }
  ) {
    return this.db.clientRelease.findMany({
      where: { organizationId, ...where },
      include: { client: { select: { name: true } } },
      orderBy: [
        { releasedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 200,
    })
  }

  /** Releases in test, newest first, for the CRM overview. */
  listReleasesInTest(organizationId: string, take: number) {
    return this.db.clientRelease.findMany({
      where: { organizationId, status: "in_test" },
      include: { client: { select: { name: true } } },
      orderBy: [
        { releasedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take,
    })
  }

  /** Feedback count, open count and test date range per release. */
  async releaseStats(
    organizationId: string,
    releaseIds: string[],
    openStatuses: readonly string[]
  ) {
    if (releaseIds.length === 0) return []
    const where = { organizationId, releaseId: { in: releaseIds } }
    const [all, open] = await Promise.all([
      this.db.clientFeedback.groupBy({
        by: ["releaseId"],
        where,
        _count: { _all: true },
        _min: { testedAt: true },
        _max: { testedAt: true },
      }),
      this.db.clientFeedback.groupBy({
        by: ["releaseId"],
        where: { ...where, status: { in: [...openStatuses] } },
        _count: { _all: true },
      }),
    ])
    const openById = new Map(
      open.map((row) => [row.releaseId, row._count._all])
    )
    return all.map((row) => ({
      releaseId: row.releaseId,
      count: row._count._all,
      open: openById.get(row.releaseId) ?? 0,
      testedFrom: row._min.testedAt,
      testedTo: row._max.testedAt,
    }))
  }

  findRelease(organizationId: string, id: string) {
    return this.db.clientRelease.findFirst({ where: { id, organizationId } })
  }

  findReleaseByVersion(
    organizationId: string,
    clientId: string,
    version: string
  ) {
    return this.db.clientRelease.findFirst({
      where: { organizationId, clientId, version },
      select: { id: true },
    })
  }

  createRelease(data: {
    organizationId: string
    clientId: string
    projectId: string | null
    version: string
    label: string | null
    releasedAt: Date | null
    status: string
    notes: string | null
    portalVisible: boolean
    createdBy: string
  }) {
    return this.db.clientRelease.create({ data })
  }

  /** Keeps the feedback project snapshot aligned with its release. */
  async updateRelease(
    id: string,
    data: {
      projectId: string | null
      version: string
      label: string | null
      releasedAt: Date | null
      status: string
      notes: string | null
      portalVisible: boolean
    }
  ) {
    const [release] = await this.db.$transaction([
      this.db.clientRelease.update({ where: { id }, data }),
      this.db.clientFeedback.updateMany({
        where: { releaseId: id },
        data: { projectId: data.projectId },
      }),
    ])
    return release
  }

  deleteRelease(id: string) {
    return this.db.clientRelease.delete({ where: { id } })
  }

  listFeedback(
    organizationId: string,
    releaseIds: string[],
    filter: {
      contactId?: string
      status?: string
      category?: string
      impact?: string
    }
  ) {
    if (releaseIds.length === 0) return Promise.resolve([])
    return this.db.clientFeedback.findMany({
      where: { organizationId, releaseId: { in: releaseIds }, ...filter },
      orderBy: [{ testedAt: "desc" }, { id: "desc" }],
    })
  }

  findFeedback(organizationId: string, id: string) {
    return this.db.clientFeedback.findFirst({ where: { id, organizationId } })
  }

  createFeedback(data: {
    organizationId: string
    clientId: string
    releaseId: string
    projectId: string | null
    contactId: string | null
    authorId: string
    assigneeId: string | null
    testedAt: Date
    environment: string
    category: string
    impact: string
    title: string
    body: string
    documentId: string | null
    version: string
  }) {
    return this.db.clientFeedback.create({ data })
  }

  updateFeedback(
    id: string,
    data: {
      releaseId?: string
      projectId?: string | null
      version?: string
      contactId?: string | null
      assigneeId?: string | null
      testedAt?: Date
      environment?: string
      category?: string
      impact?: string
      title?: string
      body?: string
      documentId?: string | null
      linkedTaskId?: string | null
      status?: string
      statusChangedAt?: Date
    }
  ) {
    return this.db.clientFeedback.update({ where: { id }, data })
  }

  deleteFeedback(id: string) {
    return this.db.clientFeedback.delete({ where: { id } })
  }

  contactNames(organizationId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([])
    return this.db.contact.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    })
  }

  // --- Audit ----------------------------------------------------------------------

  /**
   * Audit rows for this module. Goes through the shared audit helper so every
   * write lands in one table with the same actor snapshot.
   */
  async createAudit(entries: ClientAuditEntry[]): Promise<{ count: number }> {
    if (entries.length === 0) return { count: 0 }
    return this.audit(entries)
  }

  listAuditForEntity(
    organizationId: string,
    entityType: string,
    entityId: string,
    limit = 30
  ) {
    return this.db.auditLog.findMany({
      where: { organizationId, entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
  }
}
