import { buildExportPart } from "@workspace/sagas"

import { prisma } from "@/lib/prisma"

export function exportOrganization(organizationId: string) {
  const where = { organizationId }
  return buildExportPart("clients", {
    client: () => prisma.client.findMany({ where }),
    contact: () => prisma.contact.findMany({ where }),
    contactCompany: () =>
      prisma.contactCompany.findMany({ where: { contact: where } }),
    pipeline: () => prisma.pipeline.findMany({ where }),
    pipelineStage: () =>
      prisma.pipelineStage.findMany({ where: { pipeline: where } }),
    deal: () => prisma.deal.findMany({ where }),
    dealContact: () => prisma.dealContact.findMany({ where: { deal: where } }),
    clientActivity: () => prisma.clientActivity.findMany({ where }),
    clientFieldDefinition: () =>
      prisma.clientFieldDefinition.findMany({ where }),
    clientDocument: () => prisma.clientDocument.findMany({ where }),
    clientRelease: () => prisma.clientRelease.findMany({ where }),
    clientFeedback: () => prisma.clientFeedback.findMany({ where }),
    auditLog: () => prisma.auditLog.findMany({ where }),
  })
}
