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
import type { ActivityInput } from "../schemas"
import type { ClientActivityData } from "../types"
import { ClientsServiceCore, requireEdit } from "./core"

export class ClientActivitiesService extends ClientsServiceCore {
  async createActivity(
    ctx: RequestContext,
    input: ActivityInput
  ): Promise<ClientActivityData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const [client, contact, deal] = await Promise.all([
      input.clientId
        ? this.repo.findClient(ctx.organizationId, input.clientId)
        : Promise.resolve(null),
      input.contactId
        ? this.repo.findContact(ctx.organizationId, input.contactId)
        : Promise.resolve(null),
      input.dealId
        ? this.repo.findDeal(ctx.organizationId, input.dealId)
        : Promise.resolve(null),
    ])
    if (input.clientId && !client) throw new NotFoundError("Client")
    if (input.contactId && !contact) throw new NotFoundError("Contact")
    if (input.dealId && !deal) throw new NotFoundError("Deal")

    let occurredAt = new Date()
    if (input.occurredAt) {
      const parsed = new Date(input.occurredAt)
      if (Number.isNaN(parsed.getTime())) {
        throw new ValidationError("Invalid date.")
      }
      occurredAt = parsed
    }

    const row = await this.repo.createActivity({
      organizationId: ctx.organizationId,
      type: input.type,
      subject: input.subject ?? null,
      body: input.body,
      occurredAt,
      authorId: ctx.userId,
      clientId: input.clientId ?? null,
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
    })
    return this.mapActivity(row, new Map([[ctx.userId, ctx.userName]]))
  }

  async listActivitiesPage(
    ctx: RequestContext,
    input: PageInput & {
      clientId?: string
      contactId?: string
      dealId?: string
    } = {}
  ): Promise<Page<ClientActivityData>> {
    const limit = pageSize(input.limit)
    const decoded = decodeCursor(input.cursor)
    const after =
      decoded && decoded[0] && decoded[1]
        ? { occurredAt: new Date(decoded[0]), id: decoded[1] }
        : null
    const [rows, memberRows] = await Promise.all([
      this.repo.listActivitiesFor(
        ctx.organizationId,
        {
          clientId: input.clientId,
          contactId: input.contactId,
          dealId: input.dealId,
        },
        { after, take: limit + 1 }
      ),
      this.repo.listMembers(ctx.organizationId),
    ])
    const nameById = this.nameById(memberRows)
    const page = toPage(rows, limit, (row) =>
      encodeCursor([row.occurredAt.toISOString(), row.id])
    )
    return {
      items: page.items.map((row) => this.mapActivity(row, nameById)),
      nextCursor: page.nextCursor,
    }
  }
}
