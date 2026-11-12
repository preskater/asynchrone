import type { DeletionResult } from "@workspace/contracts"

import { prisma } from "@/lib/prisma"

const APP = "clients"
const DELETED = "deleted"

export async function deleteOrganization(
  organizationId: string
): Promise<DeletionResult> {
  const where = { organizationId }
  const deleted = await prisma.$transaction(async (tx) => {
    const contactCompany = await tx.contactCompany.deleteMany({
      where: { contact: where },
    })
    const dealContact = await tx.dealContact.deleteMany({
      where: { deal: where },
    })
    const stages = await tx.pipelineStage.deleteMany({
      where: { pipeline: where },
    })
    const deals = await tx.deal.deleteMany({ where })
    const pipelines = await tx.pipeline.deleteMany({ where })
    const feedback = await tx.clientFeedback.deleteMany({ where })
    const releases = await tx.clientRelease.deleteMany({ where })
    const contacts = await tx.contact.deleteMany({ where })
    const clients = await tx.client.deleteMany({ where })
    const activities = await tx.clientActivity.deleteMany({ where })
    const fields = await tx.clientFieldDefinition.deleteMany({ where })
    const documents = await tx.clientDocument.deleteMany({ where })
    const auditLog = await tx.auditLog.deleteMany({ where })
    return {
      contactCompany: contactCompany.count,
      dealContact: dealContact.count,
      pipelineStage: stages.count,
      deal: deals.count,
      pipeline: pipelines.count,
      clientFeedback: feedback.count,
      clientRelease: releases.count,
      contact: contacts.count,
      client: clients.count,
      clientActivity: activities.count,
      clientFieldDefinition: fields.count,
      clientDocument: documents.count,
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
    const clients = await tx.client.updateMany({
      where: { ownerId: userId },
      data: { ownerId: null },
    })
    const deals = await tx.deal.updateMany({
      where: { ownerId: userId },
      data: { ownerId: null },
    })
    const activities = await tx.clientActivity.updateMany({
      where: { authorId: userId },
      data: { actorId: DELETED },
    })
    const documents = await tx.clientDocument.updateMany({
      where: { addedBy: userId },
      data: { addedBy: DELETED },
    })
    const feedbackAuthor = await tx.clientFeedback.updateMany({
      where: { authorId: userId },
      data: { authorId: DELETED },
    })
    const feedbackAssignee = await tx.clientFeedback.updateMany({
      where: { assigneeId: userId },
      data: { assigneeId: null },
    })
    const releases = await tx.clientRelease.updateMany({
      where: { createdBy: userId },
      data: { createdBy: DELETED },
    })
    return {
      clientOwner: clients.count,
      dealOwner: deals.count,
      clientActivity: activities.count,
      clientDocument: documents.count,
      clientFeedbackAuthor: feedbackAuthor.count,
      clientFeedbackAssignee: feedbackAssignee.count,
      clientRelease: releases.count,
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
