import type { RequestContext } from "@workspace/core/context"
import { ConflictError, NotFoundError } from "@workspace/core/errors"
import type { MoveStageInput, PipelineInput, StageInput } from "../schemas"
import type { ClientPipelineData } from "../types"
import { ClientsServiceCore, requireManage, DEFAULT_PIPELINE } from "./core"

export class ClientPipelinesService extends ClientsServiceCore {
  private async returnPipeline(
    ctx: RequestContext,
    pipelineId: string
  ): Promise<ClientPipelineData> {
    const [rows, stageStats] = await Promise.all([
      this.repo.listPipelines(ctx.organizationId),
      this.repo.stageDealStats(ctx.organizationId),
    ])
    const row = rows.find((pipeline) => pipeline.id === pipelineId)
    if (!row) throw new NotFoundError("Pipeline")
    return this.mapPipeline(row, this.stageStatsMap(stageStats))
  }

  async savePipeline(
    ctx: RequestContext,
    input: PipelineInput
  ): Promise<ClientPipelineData> {
    const access = this.accessFor(ctx)
    requireManage(access)
    if (input.id) {
      const existing = await this.repo.findPipeline(
        ctx.organizationId,
        input.id
      )
      if (!existing) throw new NotFoundError("Pipeline")
      await this.repo.updatePipeline(input.id, { name: input.name })
      await this.repo.createAudit([
        {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "pipeline.updated",
          entityType: "pipeline",
          entityId: input.id,
          before: { name: existing.name },
          after: { name: input.name },
        },
      ])
      return this.returnPipeline(ctx, input.id)
    }

    const rows = await this.repo.listPipelines(ctx.organizationId)
    const makeDefault = input.makeDefault || rows.length === 0
    const created = await this.repo.createPipeline(ctx.organizationId, {
      name: input.name,
      isDefault: makeDefault,
      stages: DEFAULT_PIPELINE.stages
        .slice(0, 4)
        .map((stage, index) => ({ ...stage, position: index })),
    })
    if (makeDefault) {
      await this.repo.setOnlyDefaultPipeline(ctx.organizationId, created.id)
    }
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "pipeline.created",
        entityType: "pipeline",
        entityId: created.id,
        after: { name: created.name },
      },
    ])
    return this.returnPipeline(ctx, created.id)
  }

  async setDefaultPipeline(
    ctx: RequestContext,
    pipelineId: string
  ): Promise<ClientPipelineData> {
    const access = this.accessFor(ctx)
    requireManage(access)
    const existing = await this.repo.findPipeline(
      ctx.organizationId,
      pipelineId
    )
    if (!existing) throw new NotFoundError("Pipeline")
    await this.repo.setOnlyDefaultPipeline(ctx.organizationId, pipelineId)
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "pipeline.default",
        entityType: "pipeline",
        entityId: pipelineId,
      },
    ])
    return this.returnPipeline(ctx, pipelineId)
  }

  async deletePipeline(
    ctx: RequestContext,
    pipelineId: string
  ): Promise<{ id: string }> {
    const access = this.accessFor(ctx)
    requireManage(access)
    const existing = await this.repo.findPipeline(
      ctx.organizationId,
      pipelineId
    )
    if (!existing) throw new NotFoundError("Pipeline")
    if (existing.isDefault) {
      throw new ConflictError("The default pipeline cannot be deleted.", {
        code: "pipeline_is_default",
      })
    }
    const dealCount = await this.repo.countDealsInPipeline(pipelineId)
    if (dealCount > 0) {
      throw new ConflictError(
        "Move the deals of this pipeline to another pipeline first.",
        { code: "pipeline_not_empty", params: { count: dealCount } }
      )
    }
    await this.repo.deletePipeline(pipelineId)
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "pipeline.deleted",
        entityType: "pipeline",
        entityId: pipelineId,
        before: { name: existing.name },
      },
    ])
    return { id: pipelineId }
  }

  async saveStage(
    ctx: RequestContext,
    input: StageInput
  ): Promise<ClientPipelineData> {
    const access = this.accessFor(ctx)
    requireManage(access)
    const pipeline = await this.repo.findPipeline(
      ctx.organizationId,
      input.pipelineId
    )
    if (!pipeline) throw new NotFoundError("Pipeline")

    if (input.id) {
      const existing = await this.repo.findStage(ctx.organizationId, input.id)
      if (!existing || existing.pipelineId !== input.pipelineId) {
        throw new NotFoundError("Stage")
      }
      await this.repo.updateStage(input.id, {
        name: input.name,
        type: input.type,
        color: input.color ?? null,
      })
      await this.repo.createAudit([
        {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "stage.updated",
          entityType: "pipeline",
          entityId: input.pipelineId,
          before: { name: existing.name, type: existing.type },
          after: { name: input.name, type: input.type },
        },
      ])
      return this.returnPipeline(ctx, input.pipelineId)
    }

    const rows = await this.repo.listPipelines(ctx.organizationId)
    const current = rows.find((row) => row.id === input.pipelineId)
    const position = current ? current.stages.length : 0
    const created = await this.repo.createStage({
      pipelineId: input.pipelineId,
      name: input.name,
      type: input.type,
      position,
      color: input.color ?? null,
    })
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "stage.created",
        entityType: "pipeline",
        entityId: input.pipelineId,
        after: { name: created.name, type: created.type },
      },
    ])
    return this.returnPipeline(ctx, input.pipelineId)
  }

  async moveStage(
    ctx: RequestContext,
    input: MoveStageInput
  ): Promise<ClientPipelineData> {
    const access = this.accessFor(ctx)
    requireManage(access)
    const rows = await this.repo.listPipelines(ctx.organizationId)
    const pipeline = rows.find((row) => row.id === input.pipelineId)
    if (!pipeline) throw new NotFoundError("Pipeline")
    const stages = [...pipeline.stages].sort((a, b) => a.position - b.position)
    const index = stages.findIndex((stage) => stage.id === input.stageId)
    if (index < 0) throw new NotFoundError("Stage")
    const target = input.direction === "up" ? index - 1 : index + 1
    if (target < 0 || target >= stages.length) {
      const stageStats = await this.repo.stageDealStats(ctx.organizationId)
      return this.mapPipeline(pipeline, this.stageStatsMap(stageStats))
    }
    const swapped = [...stages]
    const [moved] = swapped.splice(index, 1)
    swapped.splice(target, 0, moved!)
    await this.repo.updateStagePositions(
      swapped.map((stage, position) => ({ id: stage.id, position }))
    )
    return this.returnPipeline(ctx, input.pipelineId)
  }

  async deleteStage(
    ctx: RequestContext,
    stageId: string
  ): Promise<ClientPipelineData> {
    const access = this.accessFor(ctx)
    requireManage(access)
    const stage = await this.repo.findStage(ctx.organizationId, stageId)
    if (!stage) throw new NotFoundError("Stage")
    const rows = await this.repo.listPipelines(ctx.organizationId)
    const pipeline = rows.find((row) => row.id === stage.pipelineId)
    if (pipeline && pipeline.stages.length <= 1) {
      throw new ConflictError("A pipeline needs at least one stage.", {
        code: "stage_last_required",
      })
    }
    const dealCount = await this.repo.countStageDeals(stageId)
    if (dealCount > 0) {
      throw new ConflictError(
        "Move the deals out of this stage before deleting it.",
        { code: "stage_not_empty", params: { count: dealCount } }
      )
    }
    await this.repo.deleteStage(stageId)
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "stage.deleted",
        entityType: "pipeline",
        entityId: stage.pipelineId,
        before: { name: stage.name },
      },
    ])
    return this.returnPipeline(ctx, stage.pipelineId)
  }
}
