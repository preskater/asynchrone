import { z } from "zod"

import type {
  DelegatedContext,
  DomainCall,
  DomainOperation,
} from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { rolesFrom } from "@workspace/core/roles"
import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import {
  createProjectSchema,
  createTaskSchema,
  moveTaskSchema,
  updateTaskSchema,
} from "@workspace/projects/schemas"
import { setUserRepositoryTokenSchema } from "@workspace/projects/integrations/schemas"

import { repositoryIntegrationService } from "@/lib/integrations"
import { projectService } from "@/lib/projects"
import {
  createProjectMessage,
  listProjectMessages,
} from "@/lib/projects/thread"
import {
  createTaskComment,
  listTaskComments,
} from "@/lib/projects/task-comments"
import { prisma } from "@/lib/prisma"

function requestContext(context: DelegatedContext): RequestContext {
  return {
    userId: context.userId,
    userName: context.userName,
    userEmail: context.userEmail,
    organizationId: context.organizationId,
    roles: rolesFrom(context),
  }
}

function portalClientId(context: DelegatedContext): string {
  const clientId = context.portal?.clientId
  if (!clientId) {
    throw new ForbiddenError("A portal client context is required.")
  }
  return clientId
}

const projectIdInput = z.object({ projectId: z.string().min(1) })
const projectClientInput = z.object({
  projectId: z.string().min(1),
  clientId: z.string().min(1).nullable(),
})
const clientIdInput = z.object({ clientId: z.string().min(1) })
const taskInput = z.object({ taskId: z.string().min(1) })
const portalTaskInput = z.object({
  projectId: z.string().min(1),
  taskId: z.string().min(1),
})
const messageInput = z.object({
  projectId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
})
const commentInput = z.object({
  taskId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
})
const unreadInput = z.object({
  projectIds: z.array(z.string()).default([]),
  since: z.string().datetime().nullable().optional(),
})

function iso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined
}

async function portalProject(
  organizationId: string,
  clientId: string,
  projectId: string
) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
      clientId,
      clientVisible: true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      dueDate: true,
      createdAt: true,
      clientDiscussion: true,
      clientTaskComments: true,
    },
  })
}

export async function dispatchDomain(
  operation: DomainOperation,
  call: DomainCall
): Promise<unknown> {
  const ctx = requestContext(call.context)

  switch (operation) {
    case "list-projects":
      return projectService.list(ctx)
    case "get-project":
      return projectService.get(ctx, projectIdInput.parse(call.input).projectId)
    case "list-calendar-tasks": {
      const { tasks } = await projectService.listWorkspace(ctx, {
        taskLimit: 500,
        activityLimit: 0,
      })
      return tasks
    }
    case "list-project-options": {
      const { projects } = await projectService.listShell(ctx)
      return projects.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        clientId: project.clientId ?? null,
        clientName: project.clientName ?? null,
        isBillable: project.isBillable,
        plannedHours: project.plannedHours ?? null,
        startDate: project.startDate ?? null,
        endDate: project.endDate ?? null,
      }))
    }
    case "list-project-shell": {
      // Projects and labels without tasks, for the public API (ADR 0042).
      const { projects, labels } = await projectService.listShell(ctx)
      return { projects, labels }
    }
    case "list-user-repository-tokens":
      return repositoryIntegrationService.listUserTokens(ctx)
    case "set-user-repository-token":
      return repositoryIntegrationService.setUserToken(
        ctx,
        setUserRepositoryTokenSchema.parse(call.input)
      )
    case "remove-user-repository-token": {
      const provider = z
        .object({ provider: z.string().min(1) })
        .parse(call.input)
      return repositoryIntegrationService.removeUserToken(
        ctx,
        provider.provider as never
      )
    }
    case "update-project-employee": {
      const input = z
        .object({
          projectId: z.string().min(1),
          clientId: z.string().min(1).nullable().optional(),
          plannedHours: z.number().nonnegative().nullable().optional(),
          isBillable: z.boolean().optional(),
          startDate: z.coerce.date().nullable().optional(),
          endDate: z.coerce.date().nullable().optional(),
        })
        .parse(call.input)
      const project = await projectService.setEmployeeSettings(ctx, input)
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        clientId: project.clientId ?? null,
        clientName: project.clientName ?? null,
        isBillable: project.isBillable,
        plannedHours: project.plannedHours ?? null,
        startDate: project.startDate ?? null,
        endDate: project.endDate ?? null,
      }
    }
    case "count-projects-by-client": {
      const projects = await projectService.listClientOptions(ctx)
      const counts = new Map<string, number>()
      for (const project of projects) {
        if (!project.clientId) continue
        counts.set(project.clientId, (counts.get(project.clientId) ?? 0) + 1)
      }
      return [...counts].map(([clientId, count]) => ({ clientId, count }))
    }
    case "count-client-projects": {
      const projects = await projectService.listClientOptions(ctx)
      const { clientId } = clientIdInput.parse(call.input)
      return projects.filter((project) => project.clientId === clientId).length
    }
    case "list-client-projects": {
      const projects = await projectService.listClientOptions(ctx)
      const { clientId } = clientIdInput.parse(call.input)
      return projects
        .filter((project) => project.clientId === clientId)
        .map((project) => ({
          id: project.id,
          name: project.name,
          status: project.status,
          clientId: project.clientId ?? null,
        }))
    }
    case "set-project-client": {
      const input = projectClientInput.parse(call.input)
      const project = await projectService.setClient(
        ctx,
        input.projectId,
        input.clientId
      )
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        clientId: project.clientId ?? null,
      }
    }
    case "list-tasks":
      return projectService.listTasks(
        ctx,
        projectIdInput.parse(call.input).projectId
      )
    case "create-project":
      return projectService.create(ctx, createProjectSchema.parse(call.input))
    case "create-task":
      return projectService.createTask(ctx, createTaskSchema.parse(call.input))
    case "create-project-message":
      return createProjectMessage({
        organizationId: ctx.organizationId,
        ...messageInput.parse(call.input),
        authorId: ctx.userId,
        authorKind: "internal",
      })
    case "create-task-comment":
      return createTaskComment({
        organizationId: ctx.organizationId,
        ...commentInput.parse(call.input),
        authorId: ctx.userId,
        authorKind: "internal",
        authorName: ctx.userName,
      })
    case "update-task": {
      const input = z
        .object({ taskId: z.string().min(1) })
        .extend(updateTaskSchema.shape)
        .parse(call.input)
      const { taskId, ...patch } = input
      return projectService.updateTask(ctx, taskId, patch)
    }
    case "move-task": {
      const input = z
        .object({ taskId: z.string().min(1) })
        .extend(moveTaskSchema.shape)
        .parse(call.input)
      const { taskId, ...rest } = input
      return projectService.moveTask(ctx, taskId, rest)
    }
    case "portal-list-projects": {
      const clientId = portalClientId(call.context)
      const rows = await prisma.project.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          clientVisible: true,
        },
        select: {
          id: true,
          name: true,
          status: true,
          dueDate: true,
          tasks: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
      })
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        dueDate: iso(row.dueDate),
        doneTasks: row.tasks.filter((task) => task.status === "done").length,
        totalTasks: row.tasks.length,
        unreadCount: 0,
      }))
    }
    case "portal-list-unread-messages": {
      const clientId = portalClientId(call.context)
      const input = unreadInput.parse(call.input)
      if (input.projectIds.length === 0) return []
      const rows = await prisma.projectMessage.findMany({
        where: {
          organizationId: ctx.organizationId,
          projectId: { in: input.projectIds },
          project: { clientId, clientVisible: true },
          authorId: { not: ctx.userId },
          ...(input.since ? { createdAt: { gt: new Date(input.since) } } : {}),
        },
        select: { projectId: true },
      })
      return rows
    }
    case "portal-get-project": {
      const clientId = portalClientId(call.context)
      const { projectId } = projectIdInput.parse(call.input)
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          organizationId: ctx.organizationId,
          clientId,
          clientVisible: true,
        },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          dueDate: true,
          createdAt: true,
          clientDiscussion: true,
          clientTaskComments: true,
          tasks: {
            select: { id: true, title: true, status: true, dueDate: true },
            orderBy: { order: "asc" },
          },
        },
      })
      if (!project) return null
      return {
        id: project.id,
        name: project.name,
        description: project.description ?? undefined,
        status: project.status,
        dueDate: iso(project.dueDate),
        createdAt: project.createdAt.toISOString(),
        tasks: project.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          dueDate: iso(task.dueDate),
        })),
        discussionPolicy: project.clientDiscussion,
        taskCommentsPolicy: project.clientTaskComments,
      }
    }
    case "portal-get-task": {
      const clientId = portalClientId(call.context)
      const { projectId, taskId } = portalTaskInput.parse(call.input)
      const project = await portalProject(
        ctx.organizationId,
        clientId,
        projectId
      )
      if (!project) return null
      const task = await prisma.task.findFirst({
        where: { id: taskId, projectId, organizationId: ctx.organizationId },
        select: {
          id: true,
          identifier: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          dueDate: true,
          endDate: true,
          createdAt: true,
          subtasks: {
            select: { id: true, title: true, done: true },
            orderBy: { order: "asc" },
          },
          labels: { include: { label: { select: { name: true } } } },
        },
      })
      if (!task) return null
      return {
        id: task.id,
        identifier: task.identifier,
        title: task.title,
        description: task.description ?? undefined,
        status: task.status,
        priority: task.priority,
        dueDate: iso(task.dueDate),
        endDate: iso(task.endDate),
        createdAt: task.createdAt.toISOString(),
        labels: task.labels.map((entry) => entry.label.name),
        subtasks: task.subtasks.map((subtask) => ({
          id: subtask.id,
          title: subtask.title,
          done: subtask.done,
        })),
      }
    }
    case "portal-list-messages": {
      const clientId = portalClientId(call.context)
      const { projectId } = projectIdInput.parse(call.input)
      const project = await portalProject(
        ctx.organizationId,
        clientId,
        projectId
      )
      if (!project) return []
      if (project.clientDiscussion === "none") return []
      return listProjectMessages(ctx.organizationId, projectId)
    }
    case "portal-create-message": {
      const clientId = portalClientId(call.context)
      const input = messageInput.parse(call.input)
      const project = await portalProject(
        ctx.organizationId,
        clientId,
        input.projectId
      )
      if (!project) throw new NotFoundError("Project")
      if (project.clientDiscussion !== "read_write") {
        throw new ForbiddenError(
          "The discussion is read-only for this client.",
          {
            code: "portal_read_only",
          }
        )
      }
      return createProjectMessage({
        organizationId: ctx.organizationId,
        projectId: input.projectId,
        authorId: ctx.userId,
        authorKind: "client",
        body: input.body,
      })
    }
    case "portal-list-task-comments": {
      const clientId = portalClientId(call.context)
      const { taskId } = taskInput.parse(call.input)
      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
          organizationId: ctx.organizationId,
          project: { clientId, clientVisible: true },
        },
        select: {
          id: true,
          project: { select: { clientTaskComments: true } },
        },
      })
      if (!task || task.project.clientTaskComments === "none") return []
      return listTaskComments(ctx.organizationId, taskId)
    }
    case "portal-create-task-comment": {
      const clientId = portalClientId(call.context)
      const input = commentInput.parse(call.input)
      const task = await prisma.task.findFirst({
        where: {
          id: input.taskId,
          organizationId: ctx.organizationId,
          project: { clientId, clientVisible: true },
        },
        select: {
          id: true,
          project: { select: { clientTaskComments: true } },
        },
      })
      if (!task) throw new NotFoundError("Task")
      if (task.project.clientTaskComments !== "read_write") {
        throw new ForbiddenError(
          "Task comments are read-only for this client.",
          { code: "portal_read_only" }
        )
      }
      return createTaskComment({
        organizationId: ctx.organizationId,
        taskId: input.taskId,
        authorId: ctx.userId,
        authorKind: "client",
        authorName: ctx.userName,
        body: input.body,
      })
    }
    default:
      throw new NotFoundError("Domain operation")
  }
}
