import type { RequestContext } from "@workspace/core/context"
import { ConflictError, NotFoundError } from "@workspace/core/errors"
import type {
  LinkDocumentInput,
  UpdateDocumentVisibilityInput,
} from "../schemas"
import type {
  ClientDocumentData,
  ClientFieldEntity,
  ClientFileOptionData,
} from "../types"
import { ClientsServiceCore, requireEdit, text } from "./core"

export class ClientDocumentsService extends ClientsServiceCore {
  private async entityExists(
    organizationId: string,
    entity: ClientFieldEntity,
    entityId: string
  ): Promise<boolean> {
    if (entity === "client") {
      return Boolean(await this.repo.findClient(organizationId, entityId))
    }
    if (entity === "contact") {
      return Boolean(await this.repo.findContact(organizationId, entityId))
    }
    return Boolean(await this.repo.findDeal(organizationId, entityId))
  }

  private entityLabel(entity: ClientFieldEntity): string {
    if (entity === "client") return "Client"
    if (entity === "contact") return "Contact"
    return "Deal"
  }

  async listDocuments(
    ctx: RequestContext,
    entity: ClientFieldEntity,
    entityId: string
  ): Promise<ClientDocumentData[]> {
    if (!(await this.entityExists(ctx.organizationId, entity, entityId))) {
      throw new NotFoundError(this.entityLabel(entity))
    }
    const [rows, nameById] = await Promise.all([
      this.repo.listDocuments(ctx.organizationId, entity, entityId),
      this.memberNameById(ctx.organizationId),
    ])
    return rows.map((row) => this.mapDocument(row, nameById))
  }

  async linkDocument(
    ctx: RequestContext,
    input: LinkDocumentInput
  ): Promise<ClientDocumentData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const [file, exists] = await Promise.all([
      this.repo.findFileForLink(ctx.organizationId, input.fileId),
      this.entityExists(ctx.organizationId, input.entity, input.entityId),
    ])
    if (!exists) throw new NotFoundError(this.entityLabel(input.entity))
    if (!file) throw new NotFoundError("File")
    if (file.trashed) {
      throw new ConflictError("This file is in the trash.", {
        code: "file_in_trash",
      })
    }
    const existing = await this.repo.findDocumentLink(
      ctx.organizationId,
      input.fileId,
      input.entity,
      input.entityId
    )
    if (existing) {
      throw new ConflictError("This file is already linked to this record.", {
        code: "file_already_linked",
      })
    }
    const row = await this.repo.createDocument({
      organizationId: ctx.organizationId,
      fileId: input.fileId,
      entity: input.entity,
      entityId: input.entityId,
      visibility: input.visibility,
      addedBy: ctx.userId,
    })
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: `${input.entity}.document.linked`,
        entityType: input.entity,
        entityId: input.entityId,
        after: { fileName: row.file.name },
      },
    ])
    return this.mapDocument(row, new Map([[ctx.userId, ctx.userName]]))
  }

  async unlinkDocument(
    ctx: RequestContext,
    id: string
  ): Promise<{ id: string }> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const row = await this.repo.findDocument(ctx.organizationId, id)
    if (!row) throw new NotFoundError("Document")
    await this.repo.deleteDocument(id)
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: `${row.entity}.document.unlinked`,
        entityType: row.entity,
        entityId: row.entityId,
        after: { fileName: row.file.name },
      },
    ])
    return { id }
  }

  async updateDocumentVisibility(
    ctx: RequestContext,
    input: UpdateDocumentVisibilityInput
  ): Promise<ClientDocumentData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const row = await this.repo.findDocument(ctx.organizationId, input.id)
    if (!row) throw new NotFoundError("Document")
    const updated = await this.repo.updateDocumentVisibility(
      input.id,
      input.visibility
    )
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action:
          input.visibility === "client"
            ? `${row.entity}.document.shared`
            : `${row.entity}.document.unshared`,
        entityType: row.entity,
        entityId: row.entityId,
        after: { fileName: row.file.name },
      },
    ])
    return this.mapDocument(
      updated,
      await this.memberNameById(ctx.organizationId)
    )
  }

  /** Files of the organization that can be linked to a client record. */
  async fetchFileOptions(ctx: RequestContext): Promise<ClientFileOptionData[]> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const rows = await this.repo.listFileOptions(ctx.organizationId)
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      mimeType: text(row.mimeType),
      modifiedAt: row.modifiedAt.toISOString(),
    }))
  }
}
