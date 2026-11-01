import type { RequestContext } from "@workspace/core/context"
import { NotFoundError } from "@workspace/core/errors"
import { encodeCursor, pageSize, toPage } from "@workspace/core/pagination"
import type { ClientAccess } from "../access"
import { toDateKey } from "../dates"
import type {
  ClientAccessData,
  ClientDetailData,
  ClientOptionData,
  ClientContactDetailData,
  ClientContactOptionData,
  ClientDealDetailData,
  ClientOverviewData,
  ClientProjectOptionData,
} from "../types"
import { ClientsServiceCore, text } from "./core"

export class ClientOverviewService extends ClientsServiceCore {
  async getOverview(ctx: RequestContext): Promise<ClientOverviewData> {
    const access = this.accessFor(ctx)
    await this.ensureDefaultPipeline(ctx.organizationId)
    const limit = pageSize(undefined, 50)
    const activityLimit = pageSize(undefined, 30)
    const wonSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [
      memberRows,
      clientRows,
      contactRows,
      pipelineRows,
      dealRows,
      activityRows,
      fieldRows,
      clientStatMaps,
      contactDealCounts,
      stageStats,
      statusCounts,
      dealKpis,
      clientOptions,
      contactOptions,
    ] = await Promise.all([
      this.repo.listMembers(ctx.organizationId),
      this.repo.listClientsPage(ctx.organizationId, { take: limit + 1 }),
      this.repo.listContactsPage(ctx.organizationId, { take: limit + 1 }),
      this.repo.listPipelines(ctx.organizationId),
      this.repo.listDealsPage(ctx.organizationId, { take: limit + 1 }),
      this.repo.listActivities(ctx.organizationId, { take: activityLimit + 1 }),
      this.repo.listFieldDefinitions(ctx.organizationId),
      this.loadClientStatMaps(ctx.organizationId),
      this.loadContactDealCounts(ctx.organizationId),
      this.repo.stageDealStats(ctx.organizationId),
      this.repo.clientStatusCounts(ctx.organizationId),
      this.repo.dealStats(ctx.organizationId, wonSince),
      this.repo.listClientOptions(ctx.organizationId),
      this.repo.listContactOptions(ctx.organizationId),
    ])
    const nameById = this.nameById(memberRows)

    const clientPage = toPage(clientRows, limit, (row) =>
      encodeCursor([row.name, row.id])
    )
    const contactPage = toPage(contactRows, limit, (row) =>
      encodeCursor([row.lastName, row.firstName, row.id])
    )
    const dealPage = toPage(dealRows, limit, (row) =>
      encodeCursor([row.createdAt.toISOString(), row.id])
    )
    const activityPage = toPage(activityRows, activityLimit, (row) =>
      encodeCursor([row.occurredAt.toISOString(), row.id])
    )

    const clients = clientPage.items.map((row) =>
      this.mapClient(
        row,
        this.clientStatsFrom(row.id, clientStatMaps),
        row.ownerId ? nameById.get(row.ownerId) : undefined
      )
    )
    const contacts = contactPage.items.map((row) =>
      this.mapContact(
        row,
        contactDealCounts.get(row.id) ?? 0,
        row.ownerId ? nameById.get(row.ownerId) : undefined
      )
    )
    const deals = dealPage.items.map((row) =>
      this.mapDeal(row, row.ownerId ? nameById.get(row.ownerId) : undefined)
    )

    const statusMap = new Map(
      statusCounts.map((row) => [row.status, row._count._all])
    )
    const clientsTotal = [...statusMap.values()].reduce(
      (total, count) => total + count,
      0
    )
    const stageStatsMap = this.stageStatsMap(stageStats)
    let clientsOpenValue = 0
    for (const [clientId, dealStats] of clientStatMaps.deals) {
      if (clientId) clientsOpenValue += dealStats.value
    }

    return {
      todayKey: toDateKey(new Date()),
      access: this.accessData(access, ctx),
      members: this.mapMembers(memberRows),
      fieldDefinitions: fieldRows.map((row) => this.mapFieldDefinition(row)),
      clients,
      contacts,
      clientOptions: clientOptions.map((row) => ({
        id: row.id,
        name: row.name,
      })),
      contactOptions: contactOptions.map((row) => ({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`.trim(),
        email: text(row.email),
      })),
      pagination: {
        clients: clientPage.nextCursor,
        contacts: contactPage.nextCursor,
        deals: dealPage.nextCursor,
        recentActivities: activityPage.nextCursor,
      },
      stats: {
        clients: {
          total: clientsTotal,
          active: statusMap.get("active") ?? 0,
          prospects: statusMap.get("prospect") ?? 0,
          openValue: clientsOpenValue,
        },
        deals: {
          openCount: dealKpis.openCount,
          openValue: dealKpis.openValue,
          weighted: dealKpis.weighted,
          won30: dealKpis.wonValue,
        },
      },
      pipelines: pipelineRows.map((row) =>
        this.mapPipeline(row, stageStatsMap)
      ),
      deals,
      recentActivities: activityPage.items.map((row) =>
        this.mapActivity(row, nameById)
      ),
    }
  }

  private accessData(
    access: ClientAccess,
    ctx: RequestContext
  ): ClientAccessData {
    return {
      canEdit: access.canEdit,
      canManage: access.canManage,
      canExport: access.canExport,
      currentUserId: ctx.userId,
    }
  }

  async getClientDetail(
    ctx: RequestContext,
    clientId: string
  ): Promise<ClientDetailData> {
    const access = this.accessFor(ctx)
    const [
      row,
      memberRows,
      fieldRows,
      clientRows,
      contactRows,
      dealRows,
      projectRows,
      documentRows,
    ] = await Promise.all([
      this.repo.findClient(ctx.organizationId, clientId),
      this.repo.listMembers(ctx.organizationId),
      this.repo.listFieldDefinitions(ctx.organizationId),
      this.repo.listClientOptions(ctx.organizationId),
      this.repo.listContactsForClient(ctx.organizationId, clientId),
      this.repo.listDealsByClient(ctx.organizationId, clientId),
      this.repo.listProjectsForClient(ctx.organizationId, clientId),
      this.repo.listDocuments(ctx.organizationId, "client", clientId),
    ])
    if (!row) throw new NotFoundError("Client")
    const nameById = this.nameById(memberRows)
    const clientContacts = contactRows
      .filter((contact) =>
        contact.companies.some((link) => link.clientId === clientId)
      )
      .map((contact) =>
        this.mapContact(
          contact,
          dealRows.filter(
            (deal) =>
              !deal.deletedAt &&
              deal.status === "open" &&
              deal.contacts.some((link) => link.contactId === contact.id)
          ).length,
          contact.ownerId ? nameById.get(contact.ownerId) : undefined
        )
      )
    const [activityRows, auditRows] = await Promise.all([
      this.repo.listActivitiesFor(
        ctx.organizationId,
        { clientId },
        { take: 50 }
      ),
      this.repo.listAuditForEntity(ctx.organizationId, "client", clientId, 30),
    ])
    const openDeals = dealRows.filter(
      (deal) => !deal.deletedAt && deal.status === "open"
    )
    return {
      access: this.accessData(access, ctx),
      members: this.mapMembers(memberRows),
      fieldDefinitions: fieldRows.map((field) =>
        this.mapFieldDefinition(field)
      ),
      clients: clientRows.map((client): ClientOptionData => ({
        id: client.id,
        name: client.name,
      })),
      client: this.mapClient(
        row,
        {
          contactCount: contactRows.filter((contact) => !contact.deletedAt)
            .length,
          openDealCount: openDeals.length,
          openDealValue: openDeals.reduce((sum, deal) => sum + deal.amount, 0),
          projectCount: projectRows.length,
        },
        row.ownerId ? nameById.get(row.ownerId) : undefined
      ),
      contacts: clientContacts,
      deals: dealRows.map((deal) =>
        this.mapDeal(
          deal,
          deal.ownerId ? nameById.get(deal.ownerId) : undefined
        )
      ),
      projects: projectRows.map((project): ClientProjectOptionData => ({
        id: project.id,
        name: project.name,
        status: project.status,
      })),
      documents: documentRows.map((doc) => this.mapDocument(doc, nameById)),
      timeline: this.mergeTimeline(activityRows, auditRows, nameById),
    }
  }

  async getContactDetail(
    ctx: RequestContext,
    contactId: string
  ): Promise<ClientContactDetailData> {
    const access = this.accessFor(ctx)
    const [row, memberRows, fieldRows, clientRows, dealRows, documentRows] =
      await Promise.all([
        this.repo.findContact(ctx.organizationId, contactId),
        this.repo.listMembers(ctx.organizationId),
        this.repo.listFieldDefinitions(ctx.organizationId),
        this.repo.listClientOptions(ctx.organizationId),
        this.repo.listDealsByContact(ctx.organizationId, contactId),
        this.repo.listDocuments(ctx.organizationId, "contact", contactId),
      ])
    if (!row) throw new NotFoundError("Contact")
    const nameById = this.nameById(memberRows)
    const [activityRows, auditRows] = await Promise.all([
      this.repo.listActivitiesFor(
        ctx.organizationId,
        { contactId },
        { take: 50 }
      ),
      this.repo.listAuditForEntity(
        ctx.organizationId,
        "contact",
        contactId,
        30
      ),
    ])
    return {
      access: this.accessData(access, ctx),
      members: this.mapMembers(memberRows),
      fieldDefinitions: fieldRows.map((field) =>
        this.mapFieldDefinition(field)
      ),
      clients: clientRows.map((client): ClientOptionData => ({
        id: client.id,
        name: client.name,
      })),
      contact: this.mapContact(
        row,
        dealRows.filter((deal) => !deal.deletedAt && deal.status === "open")
          .length,
        row.ownerId ? nameById.get(row.ownerId) : undefined
      ),
      deals: dealRows.map((deal) =>
        this.mapDeal(
          deal,
          deal.ownerId ? nameById.get(deal.ownerId) : undefined
        )
      ),
      documents: documentRows.map((doc) => this.mapDocument(doc, nameById)),
      timeline: this.mergeTimeline(activityRows, auditRows, nameById),
    }
  }

  async getDealDetail(
    ctx: RequestContext,
    dealId: string
  ): Promise<ClientDealDetailData> {
    const access = this.accessFor(ctx)
    await this.ensureDefaultPipeline(ctx.organizationId)
    const [
      row,
      memberRows,
      fieldRows,
      clientRows,
      contactRows,
      pipelineRows,
      documentRows,
      stageStatRows,
    ] = await Promise.all([
      this.repo.findDeal(ctx.organizationId, dealId),
      this.repo.listMembers(ctx.organizationId),
      this.repo.listFieldDefinitions(ctx.organizationId),
      this.repo.listClientOptions(ctx.organizationId),
      this.repo.listContactOptions(ctx.organizationId),
      this.repo.listPipelines(ctx.organizationId),
      this.repo.listDocuments(ctx.organizationId, "deal", dealId),
      this.repo.stageDealStats(ctx.organizationId),
    ])
    if (!row) throw new NotFoundError("Deal")
    const stageStats = this.stageStatsMap(stageStatRows)
    const nameById = this.nameById(memberRows)
    const [activityRows, auditRows] = await Promise.all([
      this.repo.listActivitiesFor(ctx.organizationId, { dealId }, { take: 50 }),
      this.repo.listAuditForEntity(ctx.organizationId, "deal", dealId, 30),
    ])
    return {
      access: this.accessData(access, ctx),
      members: this.mapMembers(memberRows),
      fieldDefinitions: fieldRows.map((field) =>
        this.mapFieldDefinition(field)
      ),
      clients: clientRows.map((client): ClientOptionData => ({
        id: client.id,
        name: client.name,
      })),
      contactOptions: contactRows.map((contact): ClientContactOptionData => ({
        id: contact.id,
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        email: text(contact.email),
      })),
      pipelines: pipelineRows.map((pipeline) =>
        this.mapPipeline(pipeline, stageStats)
      ),
      deal: this.mapDeal(
        row,
        row.ownerId ? nameById.get(row.ownerId) : undefined
      ),
      documents: documentRows.map((doc) => this.mapDocument(doc, nameById)),
      timeline: this.mergeTimeline(activityRows, auditRows, nameById),
    }
  }
}
