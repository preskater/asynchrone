import type { DeletionResult } from "@workspace/contracts"

import { prisma } from "@/lib/prisma"

const APP = "projects"
const DELETED = "deleted"

export async function deleteOrganization(
  organizationId: string
): Promise<DeletionResult> {
  const where = { organizationId }
  const deleted = await prisma.$transaction(async (tx) => {
    const projectMember = await tx.projectMember.deleteMany({
      where: { project: where },
    })
    const projectLabel = await tx.projectLabel.deleteMany({
      where: { project: where },
    })
    const taskLabel = await tx.taskLabel.deleteMany({ where: { task: where } })
    const subtask = await tx.subtask.deleteMany({ where: { task: where } })
    const taskComment = await tx.taskComment.deleteMany({
      where: { task: where },
    })
    const project = await tx.project.deleteMany({ where })
    const task = await tx.task.deleteMany({ where })
    const label = await tx.label.deleteMany({ where })
    const template = await tx.taskTemplate.deleteMany({ where })
    const counter = await tx.taskIdentifierCounter.deleteMany({ where })
    const activity = await tx.projectActivity.deleteMany({ where: { project: where } })
    const message = await tx.projectMessage.deleteMany({ where })
    const repository = await tx.repositoryConnection.deleteMany({ where })
    const auditLog = await tx.auditLog.deleteMany({ where })
    return {
      projectMember: projectMember.count,
      projectLabel: projectLabel.count,
      taskLabel: taskLabel.count,
      subtask: subtask.count,
      taskComment: taskComment.count,
      project: project.count,
      task: task.count,
      label: label.count,
      taskTemplate: template.count,
      taskIdentifierCounter: counter.count,
      projectActivity: activity.count,
      projectMessage: message.count,
      repositoryConnection: repository.count,
      auditLog: auditLog.count,
    }
  })
  return { app: APP, organizationId, deleted, completedAt: new Date() }
}

export async function deleteUser(
  userId: string,
  organizationId = ""
): Promise<DeletionResult> {
  const deleted = await prisma.$transaction(async (tx) => {
    const member = await tx.projectMember.deleteMany({ where: { userId } })
    const tokens = await tx.userRepositoryToken.deleteMany({ where: { userId } })
    const assigned = await tx.task.updateMany({
      where: { assigneeId: userId },
      data: { assigneeId: null },
    })
    const comments = await tx.taskComment.updateMany({
      where: { authorId: userId },
      data: { authorId: DELETED },
    })
    const messages = await tx.projectMessage.updateMany({
      where: { authorId: userId },
      data: { authorId: DELETED },
    })
    const activity = await tx.projectActivity.updateMany({
      where: { actorId: userId },
      data: { actorId: DELETED },
    })
    const repository = await tx.repositoryConnection.updateMany({
      where: { createdById: userId },
      data: { createdById: DELETED },
    })
    return {
      projectMember: member.count,
      userRepositoryToken: tokens.count,
      taskAssignee: assigned.count,
      taskComment: comments.count,
      projectMessage: messages.count,
      projectActivity: activity.count,
      repositoryConnection: repository.count,
    }
  })
  return {
    app: APP,
    organizationId,
    userId,
    deleted,
    completedAt: new Date(),
  }
}
