import { z } from "zod"

import type { DomainCall, DomainOperation } from "@workspace/contracts"
import { AUDIT_ACTIONS } from "@workspace/audit"
import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import { guestCan, type GuestCapability } from "@workspace/core/guests"
import { taskStatusSchema } from "@workspace/projects/schemas"

import { recordUserAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import {
  createProjectMessage,
  listProjectMessages,
} from "@/lib/projects/thread"
import {
  createTaskComment,
  listTaskComments,
} from "@/lib/projects/task-comments"

/**
 * External collaborators (ADR 0041).
 *
 * Copilot resolves the guest's grant and sends its project and capabilities in
 * the delegated context; nothing here accepts a project id from the input.
 * Every task is looked up through that project, so an id from another project
 * or organization is a 404, never a 403 that would confirm it exists.
 */

const taskInput = z.object({ taskId: z.string().min(1) })
const bodyInput = z.object({ body: z.string().trim().min(1).max(4000) })
const commentInput = taskInput.extend(bodyInput.shape)
const statusInput = taskInput.extend({ status: taskStatusSchema })

function iso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined
}

function requireCapability(
  guest: { capabilities: readonly string[] },
  capability: GuestCapability
) {
  if (!guestCan(guest, capability)) {
    throw new ForbiddenError("This invitation does not allow that.", {
      code: "guest_capability_missing",
    })
  }
}

export async function dispatchGuest(
  operation: DomainOperation,
  call: DomainCall
): Promise<unknown> {
  const { context } = call
  const guest = context.guest
  if (!guest) throw new ForbiddenError("A guest grant is required.")
  const { organizationId } = context
  const { projectId } = guest
  const actor = {
    organizationId,
    userId: context.userId,
    userName: context.userName,
    userEmail: context.userEmail,
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      dueDate: true,
      createdAt: true,
    },
  })
  if (!project) throw new NotFoundError("Project")

  /** A task of the granted project, or a 404. */
  async function grantedTask(taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId, organizationId },
      select: { id: true, identifier: true, status: true },
    })
    if (!task) throw new NotFoundError("Task")
    return task
  }

  switch (operation) {
    case "guest-get-project": {
      requireCapability(guest, "project:read")
      const tasks = await prisma.task.findMany({
        where: { projectId, organizationId },
        select: {
          id: true,
          identifier: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
        },
        orderBy: { order: "asc" },
      })
      return {
        id: project.id,
        name: project.name,
        description: project.description ?? undefined,
        status: project.status,
        dueDate: iso(project.dueDate),
        createdAt: project.createdAt.toISOString(),
        tasks: tasks.map((task) => ({
          id: task.id,
          identifier: task.identifier,
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: iso(task.dueDate),
        })),
      }
    }
    case "guest-get-task": {
      requireCapability(guest, "task:read")
      const { taskId } = taskInput.parse(call.input)
      const task = await prisma.task.findFirst({
        where: { id: taskId, projectId, organizationId },
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
      if (!task) throw new NotFoundError("Task")
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
        subtasks: task.subtasks,
      }
    }
    case "guest-update-task-status": {
      requireCapability(guest, "task:write")
      const input = statusInput.parse(call.input)
      const task = await grantedTask(input.taskId)
      if (task.status === input.status)
        return { id: task.id, status: task.status }
      await prisma.task.update({
        where: { id: task.id },
        data: { status: input.status },
      })
      await recordUserAudit(actor, {
        action: AUDIT_ACTIONS.taskUpdated,
        entityType: "task",
        entityId: task.id,
        entityLabel: task.identifier,
        before: { status: task.status },
        after: { status: input.status, guest: true },
      })
      return { id: task.id, status: input.status }
    }
    case "guest-list-messages":
      requireCapability(guest, "message:read")
      return listProjectMessages(organizationId, projectId)
    case "guest-create-message": {
      requireCapability(guest, "message:write")
      const { body } = bodyInput.parse(call.input)
      return createProjectMessage({
        organizationId,
        projectId,
        authorId: context.userId,
        authorKind: "guest",
        authorName: context.userName,
        body,
      })
    }
    case "guest-list-task-comments": {
      requireCapability(guest, "task:read")
      const task = await grantedTask(taskInput.parse(call.input).taskId)
      return listTaskComments(organizationId, task.id)
    }
    case "guest-create-task-comment": {
      requireCapability(guest, "task:comment")
      const input = commentInput.parse(call.input)
      const task = await grantedTask(input.taskId)
      return createTaskComment({
        organizationId,
        taskId: task.id,
        authorId: context.userId,
        authorKind: "guest",
        authorName: context.userName,
        body: input.body,
      })
    }
    default:
      throw new NotFoundError("Domain operation")
  }
}
