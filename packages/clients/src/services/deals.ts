import type { RequestContext } from "@workspace/core/context"
import { NotFoundError, ValidationError } from "@workspace/core/errors"
import {
  decodeCursor,
  encodeCursor,
  pageSize,
  toPage,
  type Page,
  type PageInput,
} from "@workspace/core/pagination"
import { parseDateKey, toDateKey } from "../dates"
import type { ClientNotify } from "../ports"
import type { ClientsRepository } from "../repository"
import type { CloseDealInput, DealInput, MoveDealInput } from "../schemas"
import type { ClientDealData } from "../types"
import {
  ClientsServiceCore,
  requireEdit,
  type DealRow,
  type FieldRow,
} from "./core"

export class ClientDealsService extends ClientsServiceCore {
  constructor(
    repo: ClientsRepository,
    private readonly notify: ClientNotify
  ) {
    super(repo)
  }

  private dealSnapshot(row: DealRow) {
    return {
      name: row.name,
      stageId: row.stageId,
      stageName: row.stage?.name ?? null,
      status: row.status,
      amount: row.amount,
      probability: row.probability,
      expectedCloseDate: row.expectedCloseDate
        ? toDateKey(row.expectedCloseDate)
        : null,
      ownerId: row.ownerId,
    }
  }

  private statusForStageType(type: string): "open" | "won" | "lost" {
    if (type === "won") return "won"
    if (type === "lost") return "lost"
    return "open"
  }

  private async dealPayload(
    ctx: RequestContext,
    fieldRows: FieldRow[],
    input: DealInput,
    existing?: DealRow
  ) {
    const [ownerExists, clientExists, knownContactCount, pipelineRows] =
      await Promise.all([
        input.ownerId
          ? this.repo.memberExists(ctx.organizationId, input.ownerId)
          : Promise.resolve(true),
        input.clientId
          ? this.repo.clientExists(ctx.organizationId, input.clientId)
          : Promise.resolve(true),
        this.repo.countContactsByIds(ctx.organizationId, [
          ...new Set(input.contactIds),
        ]),
        this.repo.listPipelines(ctx.organizationId),
      ])
    if (!ownerExists) throw new NotFoundError("Member")
    if (!clientExists) throw new NotFoundError("Client")

    let pipeline = input.pipelineId
      ? pipelineRows.find((row) => row.id === input.pipelineId)
      : (pipelineRows.find((row) => row.isDefault) ?? pipelineRows[0])
    if (input.pipelineId && !pipeline) throw new NotFoundError("Pipeline")
    if (!pipeline) throw new ValidationError("Create a pipeline first.")

    const stage = input.stageId
      ? pipelineRows
          .flatMap((row) => row.stages)
          .find((row) => row.id === input.stageId)
      : pipeline.stages[0]
    if (input.stageId && !stage) throw new NotFoundError("Stage")
    if (!stage) {
      throw new ValidationError("The pipeline has no stages configured.")
    }
    if (input.pipelineId && stage.pipelineId !== pipeline.id) {
      throw new ValidationError("The stage does not belong to this pipeline.")
    }
    pipeline =
      pipelineRows.find((row) => row.id === stage.pipelineId) ?? pipeline

    const uniqueContactIds = [...new Set(input.contactIds)]
    if (uniqueContactIds.length !== knownContactCount) {
      throw new NotFoundError("Contact")
    }
    const contactIds = uniqueContactIds

    const status = this.statusForStageType(stage.type)
    const today = new Date()
    const actualCloseDate =
      status === "open" ? null : (existing?.actualCloseDate ?? today)

    return {
      data: {
        name: input.name,
        clientId: input.clientId ?? null,
        pipelineId: pipeline.id,
        stageId: stage.id,
        amount: input.amount,
        currency: input.currency,
        probability: input.probability,
        status,
        expectedCloseDate: input.expectedCloseDate
          ? parseDateKey(input.expectedCloseDate)
          : null,
        actualCloseDate,
        lossReason: status === "lost" ? (existing?.lossReason ?? null) : null,
        source: input.source ?? null,
        description: input.description ?? null,
        ownerId: input.ownerId ?? null,
        customFields: this.normalizeCustomFields(
          fieldRows,
          "deal",
          input.customFields
        ),
      },
      contactIds,
      stage,
    }
  }

  private async returnDeal(
    ctx: RequestContext,
    id: string
  ): Promise<ClientDealData> {
    const [row, memberRows] = await Promise.all([
      this.repo.findDeal(ctx.organizationId, id),
      this.repo.listMembers(ctx.organizationId),
    ])
    if (!row) throw new NotFoundError("Deal")
    const nameById = this.nameById(memberRows)
    return this.mapDeal(
      row,
      row.ownerId ? nameById.get(row.ownerId) : undefined
    )
  }

  async saveDeal(
    ctx: RequestContext,
    input: DealInput
  ): Promise<ClientDealData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const fieldRows = await this.repo.listFieldDefinitions(ctx.organizationId)

    if (input.id) {
      const existing = await this.repo.findDeal(ctx.organizationId, input.id)
      if (!existing) throw new NotFoundError("Deal")
      const payload = await this.dealPayload(ctx, fieldRows, input, existing)
      const row = await this.repo.updateDeal(
        input.id,
        payload.data,
        payload.contactIds
      )
      const stageChanged = existing.stageId !== row.stageId
      await this.repo.createAudit([
        {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: stageChanged ? "deal.stage_changed" : "deal.updated",
          entityType: "deal",
          entityId: row.id,
          before: this.dealSnapshot(existing),
          after: this.dealSnapshot(row),
        },
      ])
      if (stageChanged) {
        await this.notify({
          organizationId: ctx.organizationId,
          userId: row.ownerId,
          actorId: ctx.userId,
          type: "deal.stage_changed",
          data: {
            dealId: row.id,
            dealName: row.name,
            stageName: row.stage?.name ?? "",
            actorName: ctx.userName,
          },
        })
      }
      return this.returnDeal(ctx, row.id)
    }

    const payload = await this.dealPayload(ctx, fieldRows, input)
    const position = await this.repo.countDealsInStage(payload.stage.id)
    const row = await this.repo.createDeal(
      {
        organizationId: ctx.organizationId,
        ...payload.data,
        position,
      },
      payload.contactIds
    )
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "deal.created",
        entityType: "deal",
        entityId: row.id,
        after: this.dealSnapshot(row),
      },
    ])
    return this.returnDeal(ctx, row.id)
  }

  async listDealsPage(
    ctx: RequestContext,
    input: PageInput = {}
  ): Promise<Page<ClientDealData>> {
    const limit = pageSize(input.limit)
    const decoded = decodeCursor(input.cursor)
    const after =
      decoded && decoded[0] && decoded[1]
        ? { createdAt: new Date(decoded[0]), id: decoded[1] }
        : null
    const [rows, memberRows] = await Promise.all([
      this.repo.listDealsPage(ctx.organizationId, {
        after,
        take: limit + 1,
      }),
      this.repo.listMembers(ctx.organizationId),
    ])
    const nameById = this.nameById(memberRows)
    const page = toPage(rows, limit, (row) =>
      encodeCursor([row.createdAt.toISOString(), row.id])
    )
    return {
      items: page.items.map((row) =>
        this.mapDeal(row, row.ownerId ? nameById.get(row.ownerId) : undefined)
      ),
      nextCursor: page.nextCursor,
    }
  }

  async moveDeal(
    ctx: RequestContext,
    input: MoveDealInput
  ): Promise<ClientDealData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const [deal, stage] = await Promise.all([
      this.repo.findDeal(ctx.organizationId, input.dealId),
      this.repo.findStage(ctx.organizationId, input.stageId),
    ])
    if (!deal) throw new NotFoundError("Deal")
    if (!stage) throw new NotFoundError("Stage")

    const stageChanged = deal.stageId !== stage.id
    const status = this.statusForStageType(stage.type)

    const stageDeals = await this.repo.listDealPositions(stage.id)
    const siblings = stageDeals.filter((row) => row.id !== deal.id)
    const index = Math.max(
      0,
      Math.min(input.position ?? siblings.length, siblings.length)
    )
    const orderedIds = siblings.map((row) => row.id)
    orderedIds.splice(index, 0, deal.id)
    await this.repo.updateDealPositions(
      orderedIds.map((id, position) => ({
        id,
        position,
        ...(id === deal.id ? { stageId: stage.id } : {}),
      }))
    )

    let updated = await this.repo.findDeal(ctx.organizationId, deal.id)
    if (!updated) throw new NotFoundError("Deal")

    if (stageChanged) {
      const today = new Date()
      const data: Parameters<ClientsRepository["updateDeal"]>[1] = {
        status,
        lossReason: stage.type === "lost" ? (input.lossReason ?? null) : null,
        actualCloseDate:
          stage.type === "open" ? null : (deal.actualCloseDate ?? today),
      }
      updated = await this.repo.updateDeal(deal.id, data)
      await this.repo.createAudit([
        {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "deal.stage_changed",
          entityType: "deal",
          entityId: deal.id,
          before: this.dealSnapshot(deal),
          after: this.dealSnapshot(updated),
        },
      ])
      await this.notify({
        organizationId: ctx.organizationId,
        userId: updated.ownerId,
        actorId: ctx.userId,
        type: "deal.stage_changed",
        data: {
          dealId: updated.id,
          dealName: updated.name,
          stageName: stage.name,
          actorName: ctx.userName,
        },
      })
    }

    return this.returnDeal(ctx, deal.id)
  }

  async closeDeal(
    ctx: RequestContext,
    input: CloseDealInput
  ): Promise<ClientDealData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const deal = await this.repo.findDeal(ctx.organizationId, input.dealId)
    if (!deal) throw new NotFoundError("Deal")
    const row = await this.repo.updateDeal(input.dealId, {
      status: input.status,
      actualCloseDate: input.actualCloseDate
        ? parseDateKey(input.actualCloseDate)
        : new Date(),
      lossReason: input.status === "lost" ? (input.lossReason ?? null) : null,
    })
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: input.status === "won" ? "deal.won" : "deal.lost",
        entityType: "deal",
        entityId: row.id,
        before: this.dealSnapshot(deal),
        after: this.dealSnapshot(row),
      },
    ])
    await this.notify({
      organizationId: ctx.organizationId,
      userId: row.ownerId,
      actorId: ctx.userId,
      type: input.status === "won" ? "deal.won" : "deal.lost",
      data: {
        dealId: row.id,
        dealName: row.name,
        stageName: row.stage?.name ?? "",
        actorName: ctx.userName,
      },
    })
    return this.returnDeal(ctx, row.id)
  }

  async reopenDeal(
    ctx: RequestContext,
    dealId: string
  ): Promise<ClientDealData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const deal = await this.repo.findDeal(ctx.organizationId, dealId)
    if (!deal) throw new NotFoundError("Deal")
    const row = await this.repo.updateDeal(dealId, {
      status: "open",
      actualCloseDate: null,
      lossReason: null,
    })
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "deal.reopened",
        entityType: "deal",
        entityId: row.id,
        before: this.dealSnapshot(deal),
        after: this.dealSnapshot(row),
      },
    ])
    return this.returnDeal(ctx, row.id)
  }

  async archiveDeal(ctx: RequestContext, id: string): Promise<ClientDealData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const existing = await this.repo.findDeal(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Deal")
    await this.repo.setDealArchived(id, new Date())
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "deal.archived",
        entityType: "deal",
        entityId: id,
      },
    ])
    return this.returnDeal(ctx, id)
  }

  async restoreDeal(ctx: RequestContext, id: string): Promise<ClientDealData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const existing = await this.repo.findDeal(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Deal")
    await this.repo.setDealArchived(id, null)
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "deal.restored",
        entityType: "deal",
        entityId: id,
      },
    ])
    return this.returnDeal(ctx, id)
  }
}
