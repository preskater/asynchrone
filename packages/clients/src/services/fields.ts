import type { RequestContext } from "@workspace/core/context"
import { NotFoundError } from "@workspace/core/errors"
import type { FieldDefinitionInput } from "../schemas"
import type { ClientFieldDefinitionData } from "../types"
import { ClientsServiceCore, requireManage, slugify } from "./core"

export class ClientFieldsService extends ClientsServiceCore {
  async saveFieldDefinition(
    ctx: RequestContext,
    input: FieldDefinitionInput
  ): Promise<ClientFieldDefinitionData> {
    const access = this.accessFor(ctx)
    requireManage(access)

    if (input.id) {
      const existing = await this.repo.findFieldDefinition(
        ctx.organizationId,
        input.id
      )
      if (!existing) throw new NotFoundError("Custom field")
      const row = await this.repo.updateFieldDefinition(input.id, {
        label: input.label,
        type: input.type,
        options: input.options,
        isRequired: input.isRequired,
      })
      await this.repo.createAudit([
        {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "clientField.updated",
          entityType: "clientField",
          entityId: row.id,
          before: { label: existing.label, type: existing.type },
          after: { label: row.label, type: row.type },
        },
      ])
      return this.mapFieldDefinition(row)
    }

    const base = slugify(input.label)
    let key = base
    let suffix = 2
    while (
      await this.repo.findFieldDefinitionByKey(
        ctx.organizationId,
        input.entity,
        key
      )
    ) {
      key = `${base}_${suffix}`
      suffix += 1
    }
    const definitions = await this.repo.listFieldDefinitions(ctx.organizationId)
    const position = definitions.filter(
      (row) => row.entity === input.entity
    ).length
    const row = await this.repo.createFieldDefinition({
      organizationId: ctx.organizationId,
      entity: input.entity,
      key,
      label: input.label,
      type: input.type,
      options: input.options,
      isRequired: input.isRequired,
      position,
    })
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "clientField.created",
        entityType: "clientField",
        entityId: row.id,
        after: { key: row.key, label: row.label },
      },
    ])
    return this.mapFieldDefinition(row)
  }

  async deleteFieldDefinition(
    ctx: RequestContext,
    id: string
  ): Promise<{ id: string }> {
    const access = this.accessFor(ctx)
    requireManage(access)
    const existing = await this.repo.findFieldDefinition(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Custom field")
    await this.repo.deleteFieldDefinition(id)
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "clientField.deleted",
        entityType: "clientField",
        entityId: id,
        before: { key: existing.key, label: existing.label },
      },
    ])
    return { id }
  }
}
