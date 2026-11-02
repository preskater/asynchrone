import { buildExportPart } from "@workspace/sagas"

import { prisma } from "@/lib/prisma"

/** One organization's projects rows, JSON-safe and scoped to this database. */
export function exportOrganization(organizationId: string) {
  const where = { organizationId }
  return buildExportPart("projects", {
    project: () => prisma.project.findMany({ where }),
    projectMember: () =>
      prisma.projectMember.findMany({ where: { project: where } }),
    label: () => prisma.label.findMany({ where }),
    projectLabel: () =>
      prisma.projectLabel.findMany({ where: { project: where } }),
    task: () => prisma.task.findMany({ where }),
    taskIdentifierCounter: () =>
      prisma.taskIdentifierCounter.findMany({ where }),
    taskTemplate: () => prisma.taskTemplate.findMany({ where }),
    taskLabel: () => prisma.taskLabel.findMany({ where: { task: where } }),
    subtask: () => prisma.subtask.findMany({ where: { task: where } }),
    taskComment: () =>
      prisma.taskComment.findMany({ where: { task: where } }),
    projectActivity: () => prisma.projectActivity.findMany({ where: { project: where } }),
    projectMessage: () => prisma.projectMessage.findMany({ where }),
    repositoryConnection: () =>
      prisma.repositoryConnection.findMany({ where }),
    auditLog: () => prisma.auditLog.findMany({ where }),
  })
}
