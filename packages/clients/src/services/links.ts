import type { RequestContext } from "@workspace/core/context"
import { ConflictError, NotFoundError } from "@workspace/core/errors"
import type { LinkProjectInput, UnlinkProjectInput } from "../schemas"
import type {
  ClientProjectLinkOptionData,
  ClientProjectOptionData,
} from "../types"
import { ClientsServiceCore, requireEdit } from "./core"

export class ClientLinksService extends ClientsServiceCore {
  /** Projects of the organization with their current company, for the picker. */
  async fetchProjectOptions(
    ctx: RequestContext
  ): Promise<ClientProjectLinkOptionData[]> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const rows = await this.repo.listProjectLinkOptions(ctx.organizationId)
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      clientId: row.clientId,
      clientName: row.client?.name ?? null,
    }))
  }

  /** Link a project to a company; re-links it if it had another company. */
  async linkProject(
    ctx: RequestContext,
    input: LinkProjectInput
  ): Promise<ClientProjectOptionData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const [client, project] = await Promise.all([
      this.repo.findClient(ctx.organizationId, input.clientId),
      this.repo.findProject(ctx.organizationId, input.projectId),
    ])
    if (!client) throw new NotFoundError("Client")
    if (!project) throw new NotFoundError("Project")
    if (project.clientId === input.clientId) {
      throw new ConflictError(
        "This project is already linked to this client.",
        {
          code: "project_already_linked",
        }
      )
    }
    const updated = await this.repo.setProjectClient(
      input.projectId,
      input.clientId
    )
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "client.project.linked",
        entityType: "client",
        entityId: input.clientId,
        after: { projectName: project.name },
      },
    ])
    return { id: updated.id, name: updated.name, status: updated.status }
  }

  async unlinkProject(
    ctx: RequestContext,
    input: UnlinkProjectInput
  ): Promise<{ id: string }> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const [client, project] = await Promise.all([
      this.repo.findClient(ctx.organizationId, input.clientId),
      this.repo.findProject(ctx.organizationId, input.projectId),
    ])
    if (!client) throw new NotFoundError("Client")
    if (!project) throw new NotFoundError("Project")
    if (project.clientId !== input.clientId) {
      throw new ConflictError("This project is not linked to this client.", {
        code: "project_not_linked",
      })
    }
    await this.repo.setProjectClient(input.projectId, null)
    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "client.project.unlinked",
        entityType: "client",
        entityId: input.clientId,
        after: { projectName: project.name },
      },
    ])
    return { id: input.projectId }
  }
}
