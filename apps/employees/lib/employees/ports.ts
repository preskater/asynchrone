import { z } from "zod"

import type { RequestContext } from "@workspace/core/context"
import type {
  EmployeeClients,
  EmployeeDirectory,
  EmployeeProjects,
} from "@workspace/employees/ports"

import { callDomain, delegatedContext } from "@/lib/internal/domain-client"
import { identity } from "@/lib/identity"

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable().optional(),
  isBillable: z.boolean(),
  plannedHours: z.number().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
})

const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  contactEmail: z.string().nullable(),
  isActive: z.boolean(),
})

export const employeeDirectory: EmployeeDirectory = {
  async list(organizationId) {
    return (await identity.listMembers(organizationId)).map((member) => ({
      userId: member.id,
      name: member.name,
      email: member.email,
      avatarUrl: member.avatarUrl,
      role: member.role,
      clientId: member.clientId,
    }))
  },
}

export const employeeProjects: EmployeeProjects = {
  async list(ctx: RequestContext) {
    let projects: z.infer<typeof projectSchema>[]
    try {
      projects = await callDomain(
        "projects",
        "list-project-options",
        delegatedContext(ctx),
        {},
        z.array(projectSchema)
      )
    } catch (error) {
      console.error("[employees] projects unavailable", error)
      return []
    }
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      clientId: project.clientId,
      clientName: project.clientName ?? null,
      isBillable: project.isBillable,
      plannedHours: project.plannedHours ?? null,
      startDate: project.startDate ? new Date(project.startDate) : null,
      endDate: project.endDate ? new Date(project.endDate) : null,
    }))
  },
  async find(ctx, id) {
    let projects: z.infer<typeof projectSchema>[]
    try {
      projects = await callDomain(
        "projects",
        "list-project-options",
        delegatedContext(ctx),
        {},
        z.array(projectSchema)
      )
    } catch (error) {
      console.error("[employees] project lookup unavailable", error)
      return null
    }
    const project = projects.find((candidate) => candidate.id === id)
    return project
      ? {
          id: project.id,
          name: project.name,
          status: project.status,
          clientId: project.clientId,
          clientName: project.clientName ?? null,
          isBillable: project.isBillable,
          plannedHours: project.plannedHours ?? null,
          startDate: project.startDate ? new Date(project.startDate) : null,
          endDate: project.endDate ? new Date(project.endDate) : null,
        }
      : null
  },
  async update(ctx, id, input) {
    const project = await callDomain(
      "projects",
      "update-project-employee",
      delegatedContext(ctx),
      { projectId: id, ...input },
      projectSchema,
      { idempotencyKey: `employee-project:${id}:${Date.now()}` }
    )
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      clientId: project.clientId,
      clientName: project.clientName ?? null,
      isBillable: project.isBillable,
      plannedHours: project.plannedHours ?? null,
      startDate: project.startDate ? new Date(project.startDate) : null,
      endDate: project.endDate ? new Date(project.endDate) : null,
    }
  },
}

export const employeeClients: EmployeeClients = {
  async list(ctx: RequestContext) {
    try {
      return await callDomain(
        "clients",
        "list-client-directory",
        delegatedContext(ctx),
        {},
        z.array(clientSchema)
      )
    } catch (error) {
      console.error("[employees] clients unavailable", error)
      return []
    }
  },
  async find(ctx, id) {
    try {
      const clients = await callDomain(
        "clients",
        "list-client-directory",
        delegatedContext(ctx),
        {},
        z.array(clientSchema)
      )
      return clients.find((client) => client.id === id) ?? null
    } catch (error) {
      console.error("[employees] client lookup unavailable", error)
      return null
    }
  },
  create(ctx, input) {
    return callDomain(
      "clients",
      "save-client-basics",
      delegatedContext(ctx),
      input,
      clientSchema,
      { idempotencyKey: `employee-client-create:${input.name}:${input.contactEmail ?? ""}` }
    )
  },
  update(ctx, id, input) {
    return callDomain(
      "clients",
      "save-client-basics",
      delegatedContext(ctx),
      { ...input, id },
      clientSchema,
      { idempotencyKey: `employee-client-update:${id}` }
    )
  },
}
