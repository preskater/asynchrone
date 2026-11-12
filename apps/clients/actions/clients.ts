"use server"

import { withAction } from "@workspace/core/action"
import {
  activityInputSchema,
  clientInputSchema,
  closeDealSchema,
  contactInputSchema,
  dealInputSchema,
  deleteFieldDefinitionSchema,
  exportSchema,
  feedbackAssigneeSchema,
  feedbackFilterSchema,
  feedbackInputSchema,
  feedbackStatusSchema,
  fieldDefinitionSchema,
  importClientsSchema,
  importContactsSchema,
  linkDocumentSchema,
  linkProjectSchema,
  moveDealSchema,
  moveStageSchema,
  pipelineInputSchema,
  releaseInputSchema,
  reopenDealSchema,
  setDefaultPipelineSchema,
  stageInputSchema,
  unlinkDocumentSchema,
  unlinkProjectSchema,
  updateDocumentVisibilitySchema,
} from "@workspace/clients/schemas"
import {
  getRequestContext,
  parseLocalized,
  revalidateOrgPath,
} from "@/lib/request-context"
import { clientsService } from "@/lib/clients"

/** Activity can surface on the list pages of every record type. */
async function revalidateClient(organizationId: string) {
  await Promise.all([
    revalidateOrgPath(organizationId, "/clients"),
    revalidateOrgPath(organizationId, "/contacts"),
    revalidateOrgPath(organizationId, "/deals"),
  ])
}

// --- Keyset-paginated list endpoints -----------------------------------------

export const listClientsAction = withAction(async (cursor?: string | null) => {
  const ctx = await getRequestContext()
  return clientsService.listClientsPage(ctx, { cursor })
})

export const listClientContactsAction = withAction(
  async (cursor?: string | null) => {
    const ctx = await getRequestContext()
    return clientsService.listContactsPage(ctx, { cursor })
  }
)

export const listClientDealsAction = withAction(
  async (cursor?: string | null) => {
    const ctx = await getRequestContext()
    return clientsService.listDealsPage(ctx, { cursor })
  }
)

export const listClientActivitiesAction = withAction(
  async (input?: {
    cursor?: string | null
    clientId?: string
    contactId?: string
    dealId?: string
  }) => {
    const ctx = await getRequestContext()
    return clientsService.listActivitiesPage(ctx, input ?? {})
  }
)

// --- Companies (clients) -----------------------------------------------------

export const saveClientAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(clientInputSchema, input)
  const client = await clientsService.saveClient(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/clients")
  return client
})

export const archiveClientAction = withAction(async (clientId: string) => {
  const ctx = await getRequestContext()
  const client = await clientsService.archiveClient(ctx, clientId)
  await revalidateOrgPath(ctx.organizationId, "/clients")
  return client
})

export const restoreClientAction = withAction(async (clientId: string) => {
  const ctx = await getRequestContext()
  const client = await clientsService.restoreClient(ctx, clientId)
  await revalidateOrgPath(ctx.organizationId, "/clients")
  return client
})

// --- Contacts ----------------------------------------------------------------

export const saveContactAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(contactInputSchema, input)
  const contact = await clientsService.saveContact(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/contacts")
  return contact
})

export const archiveContactAction = withAction(async (contactId: string) => {
  const ctx = await getRequestContext()
  const contact = await clientsService.archiveContact(ctx, contactId)
  await revalidateOrgPath(ctx.organizationId, "/contacts")
  return contact
})

export const restoreContactAction = withAction(async (contactId: string) => {
  const ctx = await getRequestContext()
  const contact = await clientsService.restoreContact(ctx, contactId)
  await revalidateOrgPath(ctx.organizationId, "/contacts")
  return contact
})

// --- Deals -------------------------------------------------------------------

export const saveDealAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(dealInputSchema, input)
  const deal = await clientsService.saveDeal(ctx, parsed)
  await revalidateClient(ctx.organizationId)
  return deal
})

export const moveDealAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(moveDealSchema, input)
  const deal = await clientsService.moveDeal(ctx, parsed)
  await revalidateClient(ctx.organizationId)
  return deal
})

export const closeDealAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(closeDealSchema, input)
  const deal = await clientsService.closeDeal(ctx, parsed)
  await revalidateClient(ctx.organizationId)
  return deal
})

export const reopenDealAction = withAction(async (dealId: string) => {
  const ctx = await getRequestContext()
  reopenDealSchema.parse({ dealId })
  const deal = await clientsService.reopenDeal(ctx, dealId)
  await revalidateClient(ctx.organizationId)
  return deal
})

export const archiveDealAction = withAction(async (dealId: string) => {
  const ctx = await getRequestContext()
  const deal = await clientsService.archiveDeal(ctx, dealId)
  await revalidateClient(ctx.organizationId)
  return deal
})

export const restoreDealAction = withAction(async (dealId: string) => {
  const ctx = await getRequestContext()
  const deal = await clientsService.restoreDeal(ctx, dealId)
  await revalidateClient(ctx.organizationId)
  return deal
})

// --- Pipelines & stages -------------------------------------------------------

export const savePipelineAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(pipelineInputSchema, input)
  const pipeline = await clientsService.savePipeline(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/deals")
  return pipeline
})

export const setDefaultPipelineAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(setDefaultPipelineSchema, input)
  const pipeline = await clientsService.setDefaultPipeline(
    ctx,
    parsed.pipelineId
  )
  await revalidateOrgPath(ctx.organizationId, "/deals")
  return pipeline
})

export const deletePipelineAction = withAction(async (pipelineId: string) => {
  const ctx = await getRequestContext()
  const result = await clientsService.deletePipeline(ctx, pipelineId)
  await revalidateOrgPath(ctx.organizationId, "/deals")
  return result
})

export const saveStageAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(stageInputSchema, input)
  const pipeline = await clientsService.saveStage(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/deals")
  return pipeline
})

export const moveStageAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(moveStageSchema, input)
  const pipeline = await clientsService.moveStage(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/deals")
  return pipeline
})

export const deleteStageAction = withAction(async (stageId: string) => {
  const ctx = await getRequestContext()
  const pipeline = await clientsService.deleteStage(ctx, stageId)
  await revalidateOrgPath(ctx.organizationId, "/deals")
  return pipeline
})

// --- Custom fields --------------------------------------------------------------

export const saveFieldDefinitionAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(fieldDefinitionSchema, input)
  const field = await clientsService.saveFieldDefinition(ctx, parsed)
  await revalidateClient(ctx.organizationId)
  return field
})

export const deleteFieldDefinitionAction = withAction(
  async (input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(deleteFieldDefinitionSchema, input)
    const result = await clientsService.deleteFieldDefinition(ctx, parsed.id)
    await revalidateClient(ctx.organizationId)
    return result
  }
)

// --- Activities -----------------------------------------------------------------

export const createActivityAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(activityInputSchema, input)
  const activity = await clientsService.createActivity(ctx, parsed)
  await revalidateClient(ctx.organizationId)
  return activity
})

// --- CSV import / export --------------------------------------------------------

export const exportClientAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(exportSchema, input)
  return clientsService.exportClient(ctx, parsed)
})

export const importClientsAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(importClientsSchema, input)
  const result = await clientsService.importClients(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/clients")
  return result
})

export const importContactsAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(importContactsSchema, input)
  const result = await clientsService.importContacts(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/contacts")
  return result
})

// --- Documents -------------------------------------------------------------------

export const linkDocumentAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(linkDocumentSchema, input)
  const document = await clientsService.linkDocument(ctx, parsed)
  await revalidateClient(ctx.organizationId)
  return document
})

export const unlinkDocumentAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(unlinkDocumentSchema, input)
  const result = await clientsService.unlinkDocument(ctx, parsed.id)
  await revalidateClient(ctx.organizationId)
  return result
})

export const updateDocumentVisibilityAction = withAction(
  async (input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(updateDocumentVisibilitySchema, input)
    const document = await clientsService.updateDocumentVisibility(ctx, parsed)
    await revalidateClient(ctx.organizationId)
    return document
  }
)

export const fetchClientFileOptionsAction = withAction(async () => {
  const ctx = await getRequestContext()
  return clientsService.fetchFileOptions(ctx)
})

// --- Projects --------------------------------------------------------------------

export const linkProjectAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(linkProjectSchema, input)
  const project = await clientsService.linkProject(ctx, parsed)
  await Promise.all([
    revalidateClient(ctx.organizationId),
    revalidateOrgPath(ctx.organizationId, "/projects"),
  ])
  return project
})

export const unlinkProjectAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(unlinkProjectSchema, input)
  const result = await clientsService.unlinkProject(ctx, parsed)
  await Promise.all([
    revalidateClient(ctx.organizationId),
    revalidateOrgPath(ctx.organizationId, "/projects"),
  ])
  return result
})

export const fetchClientProjectOptionsAction = withAction(async () => {
  const ctx = await getRequestContext()
  return clientsService.fetchProjectOptions(ctx)
})

// --- Releases and test feedback (ADR 0040) -------------------------------------

async function revalidateFeedback(organizationId: string) {
  await Promise.all([
    revalidateOrgPath(organizationId, "/clients"),
    revalidateOrgPath(organizationId, "/feedback"),
  ])
}

export const listReleaseGroupsAction = withAction(async (input?: unknown) => {
  const ctx = await getRequestContext()
  const filter = await parseLocalized(feedbackFilterSchema, input ?? {})
  return clientsService.listReleaseGroups(ctx, filter)
})

export const saveReleaseAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(releaseInputSchema, input)
  const release = await clientsService.saveRelease(ctx, parsed)
  await revalidateFeedback(ctx.organizationId)
  return release
})

export const deleteReleaseAction = withAction(async (releaseId: string) => {
  const ctx = await getRequestContext()
  const result = await clientsService.deleteRelease(ctx, releaseId)
  await revalidateFeedback(ctx.organizationId)
  return result
})

export const saveFeedbackAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(feedbackInputSchema, input)
  const feedback = await clientsService.saveFeedback(ctx, parsed)
  await revalidateFeedback(ctx.organizationId)
  return feedback
})

export const setFeedbackStatusAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(feedbackStatusSchema, input)
  const feedback = await clientsService.setFeedbackStatus(ctx, parsed)
  await revalidateFeedback(ctx.organizationId)
  return feedback
})

export const assignFeedbackAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(feedbackAssigneeSchema, input)
  const feedback = await clientsService.assignFeedback(ctx, parsed)
  await revalidateFeedback(ctx.organizationId)
  return feedback
})

export const deleteFeedbackAction = withAction(async (feedbackId: string) => {
  const ctx = await getRequestContext()
  const result = await clientsService.deleteFeedback(ctx, feedbackId)
  await revalidateFeedback(ctx.organizationId)
  return result
})
