import type { RequestContext } from "@workspace/core/context"
import { ConflictError, NotFoundError } from "@workspace/core/errors"
import {
  decodeCursor,
  encodeCursor,
  pageSize,
  toPage,
  type Page,
  type PageInput,
} from "@workspace/core/pagination"
import type { ContactInput } from "../schemas"
import type { ClientContactData } from "../types"
import {
  ClientsServiceCore,
  requireEdit,
  type ContactRow,
  type FieldRow,
} from "./core"

export class ClientContactsService extends ClientsServiceCore {
  private contactSnapshot(row: ContactRow) {
    return {
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      jobTitle: row.jobTitle,
      ownerId: row.ownerId,
      companies: row.companies.map((link) => link.client.name).join(", "),
    }
  }

  private async contactPayload(
    ctx: RequestContext,
    fieldRows: FieldRow[],
    clientRows: { id: string }[],
    input: ContactInput
  ) {
    if (
      input.ownerId &&
      !(await this.repo.memberExists(ctx.organizationId, input.ownerId))
    ) {
      throw new NotFoundError("Member")
    }
    const knownClients = new Set(clientRows.map((client) => client.id))
    const seen = new Set<string>()
    let hasPrimary = false
    const companies: {
      clientId: string
      jobTitle: string | null
      isPrimary: boolean
    }[] = []
    for (const link of input.companies) {
      if (!knownClients.has(link.clientId)) throw new NotFoundError("Client")
      if (seen.has(link.clientId)) continue
      seen.add(link.clientId)
      const isPrimary = link.isPrimary && !hasPrimary
      if (isPrimary) hasPrimary = true
      companies.push({
        clientId: link.clientId,
        jobTitle: link.jobTitle ?? null,
        isPrimary,
      })
    }
    return {
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        jobTitle: input.jobTitle ?? null,
        notes: input.notes ?? null,
        ownerId: input.ownerId ?? null,
        customFields: this.normalizeCustomFields(
          fieldRows,
          "contact",
          input.customFields
        ),
      },
      companies,
    }
  }

  private async returnContact(
    ctx: RequestContext,
    id: string
  ): Promise<ClientContactData> {
    const [row, memberRows, dealRows] = await Promise.all([
      this.repo.findContact(ctx.organizationId, id),
      this.repo.listMembers(ctx.organizationId),
      this.repo.listDealsByContact(ctx.organizationId, id),
    ])
    if (!row) throw new NotFoundError("Contact")
    const nameById = this.nameById(memberRows)
    return this.mapContact(
      row,
      dealRows.filter((deal) => !deal.deletedAt && deal.status === "open")
        .length,
      row.ownerId ? nameById.get(row.ownerId) : undefined
    )
  }

  async listContactsPage(
    ctx: RequestContext,
    input: PageInput = {}
  ): Promise<Page<ClientContactData>> {
    const limit = pageSize(input.limit)
    const decoded = decodeCursor(input.cursor)
    const after =
      decoded && decoded[0] && decoded[1] && decoded[2]
        ? {
            lastName: decoded[0],
            firstName: decoded[1],
            id: decoded[2],
          }
        : null
    const [rows, memberRows, dealCounts] = await Promise.all([
      this.repo.listContactsPage(ctx.organizationId, {
        after,
        take: limit + 1,
      }),
      this.repo.listMembers(ctx.organizationId),
      this.loadContactDealCounts(ctx.organizationId),
    ])
    const nameById = this.nameById(memberRows)
    const page = toPage(rows, limit, (row) =>
      encodeCursor([row.lastName, row.firstName, row.id])
    )
    return {
      items: page.items.map((row) =>
        this.mapContact(
          row,
          dealCounts.get(row.id) ?? 0,
          row.ownerId ? nameById.get(row.ownerId) : undefined
        )
      ),
      nextCursor: page.nextCursor,
    }
  }

  async saveContact(
    ctx: RequestContext,
    input: ContactInput
  ): Promise<ClientContactData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const [fieldRows, clientRows] = await Promise.all([
      this.repo.listFieldDefinitions(ctx.organizationId),
      this.repo.listClientOptions(ctx.organizationId),
    ])
    const payload = await this.contactPayload(ctx, fieldRows, clientRows, input)

    if (input.email) {
      const duplicate = await this.repo.findContactByEmail(
        ctx.organizationId,
        input.email
      )
      if (duplicate && duplicate.id !== input.id) {
        const name = `${duplicate.firstName} ${duplicate.lastName}`.trim()
        throw new ConflictError(
          `A contact with this email already exists (${name}).`,
          { code: "contact_email_exists", params: { name } }
        )
      }
    }

    if (input.id) {
      const existing = await this.repo.findContact(ctx.organizationId, input.id)
      if (!existing) throw new NotFoundError("Contact")
      const row = await this.repo.updateContact(
        input.id,
        payload.data,
        payload.companies
      )
      await this.repo.createAudit([
        {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "contact.updated",
          entityType: "contact",
          entityId: row.id,
          before: this.contactSnapshot(existing),
          after: this.contactSnapshot(row),
        },
      ])
      return this.returnContact(ctx, row.id)
    }

    const row = await this.repo.createContact(
      { organizationId: ctx.organizationId, ...payload.data },
      payload.companies
    )
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "contact.created",
        entityType: "contact",
        entityId: row.id,
        after: this.contactSnapshot(row),
      },
    ])
    return this.returnContact(ctx, row.id)
  }

  async archiveContact(
    ctx: RequestContext,
    id: string
  ): Promise<ClientContactData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const existing = await this.repo.findContact(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Contact")
    await this.repo.setContactArchived(id, new Date())
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "contact.archived",
        entityType: "contact",
        entityId: id,
      },
    ])
    return this.returnContact(ctx, id)
  }

  async restoreContact(
    ctx: RequestContext,
    id: string
  ): Promise<ClientContactData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const existing = await this.repo.findContact(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Contact")
    await this.repo.setContactArchived(id, null)
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "contact.restored",
        entityType: "contact",
        entityId: id,
      },
    ])
    return this.returnContact(ctx, id)
  }
}
