import { buildExportPart } from "@workspace/sagas"

import { prisma } from "@/lib/prisma"

export function exportOrganization(organizationId: string) {
  const where = { organizationId }
  return buildExportPart("files", {
    fileNode: () => prisma.fileNode.findMany({ where }),
    fileShare: () =>
      prisma.fileShare.findMany({ where: { file: where } }),
    fileVersion: () =>
      prisma.fileVersion.findMany({ where: { file: where } }),
    fileActivity: () =>
      prisma.fileActivity.findMany({ where: { file: where } }),
    uploadSession: () => prisma.uploadSession.findMany({ where }),
    auditLog: () => prisma.auditLog.findMany({ where }),
  })
}
