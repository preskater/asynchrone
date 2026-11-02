import type { RequestContext } from "@workspace/core/context"
import { NotFoundError } from "@workspace/core/errors"
import { parseDateKey } from "../date-utils"
import type {
  ActivityInput,
  ClientInput,
  ProjectEmployeeInput,
} from "../schemas"
import type {
  ClientData,
  InternalActivityData,
  ProjectOptionData,
} from "../types"
import { EmployeesServiceCore, requireAdmin, type ProjectRow } from "./core"

export class EmployeeRecordsService extends EmployeesServiceCore {
  async saveClient(
    ctx: RequestContext,
    input: ClientInput
  ): Promise<ClientData> {
    const access = await this.accessFor(ctx)
    requireAdmin(access)

    let row
    if (input.id) {
      const existing = await this.repo.findClient(ctx, input.id)
      if (!existing) throw new NotFoundError("Client")
      row = await this.repo.updateClient(ctx, input.id, {
        name: input.name,
        contactEmail: input.contactEmail ?? null,
        isActive: input.isActive,
      })
    } else {
      row = await this.repo.createClient(ctx, {
        name: input.name,
        contactEmail: input.contactEmail ?? null,
        isActive: input.isActive,
      })
    }

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: input.id ? "client.update" : "client.create",
        entityType: "client",
        entityId: row.id,
        after: { name: row.name, isActive: row.isActive },
      },
    ])

    return this.mapClient(row)
  }

  async saveActivity(
    ctx: RequestContext,
    input: ActivityInput
  ): Promise<InternalActivityData> {
    const access = await this.accessFor(ctx)
    requireAdmin(access)

    let row
    if (input.id) {
      const existing = await this.repo.findActivity(
        ctx.organizationId,
        input.id
      )
      if (!existing) throw new NotFoundError("Internal activity")
      row = await this.repo.updateActivity(input.id, {
        name: input.name,
        description: input.description ?? null,
        kind: input.kind,
        isActive: input.isActive,
      })
    } else {
      row = await this.repo.createActivity({
        organizationId: ctx.organizationId,
        name: input.name,
        description: input.description ?? null,
        kind: input.kind,
        isActive: input.isActive,
      })
    }

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: input.id ? "activity.update" : "activity.create",
        entityType: "internalActivity",
        entityId: row.id,
        after: { name: row.name, kind: row.kind, isActive: row.isActive },
      },
    ])

    return this.mapActivity(row)
  }

  async updateProjectEmployee(
    ctx: RequestContext,
    input: ProjectEmployeeInput
  ): Promise<ProjectOptionData> {
    const access = await this.accessFor(ctx)
    requireAdmin(access)

    const existing = await this.repo.findProject(
      ctx,
      input.projectId
    )
    if (!existing) throw new NotFoundError("Project")

    if (input.clientId) {
      const client = await this.repo.findClient(ctx, input.clientId)
      if (!client) throw new NotFoundError("Client")
    }

    await this.repo.updateProject(ctx, input.projectId, {
      clientId: input.clientId ?? null,
      plannedHours: input.plannedHours ?? null,
      isBillable: input.isBillable,
      startDate: input.startDate ? parseDateKey(input.startDate) : null,
      endDate: input.endDate ? parseDateKey(input.endDate) : null,
    })

    const row = await this.repo.findProject(ctx, input.projectId)
    // Re-load with client include for the mapped shape.
    const projects = await this.repo.listProjects(ctx)
    const full =
      projects.find((project) => project.id === input.projectId) ?? row
    if (!full) throw new NotFoundError("Project")

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "project.update",
        entityType: "project",
        entityId: input.projectId,
        before: {
          plannedHours: existing.plannedHours,
          isBillable: existing.isBillable,
        },
        after: {
          plannedHours: input.plannedHours ?? null,
          isBillable: input.isBillable,
        },
      },
    ])

    return this.mapProject(full as ProjectRow)
  }
}
