import { z } from "zod"

import { AUDIT_ACTIONS } from "@workspace/audit"
import type {
  DelegatedContext,
  DomainCall,
  DomainOperation,
} from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import {
  activityInputSchema,
  clientInputSchema,
  contactInputSchema,
  dealInputSchema,
  linkDocumentSchema,
  linkProjectSchema,
  moveDealSchema,
  unlinkProjectSchema,
} from "@workspace/clients/schemas"

import { clientsService } from "@/lib/clients"
import { recordUserAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"

function requestContext(context: DelegatedContext): RequestContext {
  return {
    userId: context.userId,
    userName: context.userName,
    userEmail: context.userEmail,
    organizationId: context.organizationId,
    role: context.role,
  }
}

const idInput = z.object({ id: z.string().min(1) })
const documentEntityInput = z.object({
  entity: z.enum(["client", "contact", "deal"]),
  entityId: z.string().min(1),
})
const portalDocumentInput = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
})

function portalClientId(context: DelegatedContext): string {
  const clientId = context.portal?.clientId
  if (!clientId)
    throw new ForbiddenError("A portal client context is required.")
  return clientId
}

export async function dispatchDomain(
  operation: DomainOperation,
  call: DomainCall
): Promise<unknown> {
  const ctx = requestContext(call.context)

  switch (operation) {
    case "get-clients-overview":
      return clientsService.getOverview(ctx)
    case "get-client":
      return clientsService.getClientDetail(ctx, idInput.parse(call.input).id)
    case "get-deal":
      return clientsService.getDealDetail(ctx, idInput.parse(call.input).id)
    case "save-client":
      return clientsService.saveClient(ctx, clientInputSchema.parse(call.input))
    case "save-contact":
      return clientsService.saveContact(
        ctx,
        contactInputSchema.parse(call.input)
      )
    case "save-deal":
      return clientsService.saveDeal(ctx, dealInputSchema.parse(call.input))
    case "move-deal":
      return clientsService.moveDeal(ctx, moveDealSchema.parse(call.input))
    case "create-client-activity":
      return clientsService.createActivity(
        ctx,
        activityInputSchema.parse(call.input)
      )
    case "list-client-documents": {
      const input = documentEntityInput.parse(call.input)
      return clientsService.listDocuments(ctx, input.entity, input.entityId)
    }
    case "link-client-document":
      return clientsService.linkDocument(
        ctx,
        linkDocumentSchema.parse(call.input)
      )
    case "unlink-client-document":
      return clientsService.unlinkDocument(ctx, idInput.parse(call.input).id)
    case "link-client-project":
      return clientsService.linkProject(
        ctx,
        linkProjectSchema.parse(call.input)
      )
    case "unlink-client-project":
      return clientsService.unlinkProject(
        ctx,
        unlinkProjectSchema.parse(call.input)
      )
    case "portal-get-client": {
      const clientId = portalClientId(call.context)
      return prisma.client.findFirst({
        where: { id: clientId, organizationId: ctx.organizationId },
        select: { id: true, name: true, ownerId: true },
      })
    }
    case "portal-list-documents": {
      const clientId = portalClientId(call.context)
      const links = await prisma.clientDocument.findMany({
        where: {
          organizationId: ctx.organizationId,
          entity: "client",
          entityId: clientId,
          visibility: "client",
          file: { trashed: false },
        },
        select: {
          id: true,
          fileId: true,
          addedBy: true,
          file: { select: { name: true, sizeBytes: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      })
      const names = await prisma.user.findMany({
        where: { id: { in: [...new Set(links.map((link) => link.addedBy))] } },
        select: { id: true, name: true },
      })
      const nameById = new Map(names.map((user) => [user.id, user.name]))
      return links.map((link) => ({
        id: link.id,
        fileId: link.fileId,
        name: link.file.name,
        sizeBytes: link.file.sizeBytes
          ? Number(link.file.sizeBytes)
          : undefined,
        createdAt: link.createdAt.toISOString(),
        addedByName: nameById.get(link.addedBy),
      }))
    }
    case "portal-get-document": {
      const clientId = portalClientId(call.context)
      const { fileId } = z
        .object({ fileId: z.string().min(1) })
        .parse(call.input)
      const link = await prisma.clientDocument.findFirst({
        where: {
          organizationId: ctx.organizationId,
          entity: "client",
          entityId: clientId,
          visibility: "client",
          fileId,
        },
        select: {
          file: {
            select: {
              name: true,
              oid: true,
              mimeType: true,
              trashed: true,
              sizeBytes: true,
            },
          },
        },
      })
      if (!link) return null
      return {
        name: link.file.name,
        mimeType: link.file.mimeType ?? undefined,
        oid: link.file.oid === null ? null : link.file.oid.toString(),
        trashed: link.file.trashed,
        sizeBytes: link.file.sizeBytes
          ? Number(link.file.sizeBytes)
          : undefined,
      }
    }
    case "portal-create-document": {
      const clientId = portalClientId(call.context)
      const input = portalDocumentInput.parse(call.input)
      const link = await prisma.clientDocument.create({
        data: {
          organizationId: ctx.organizationId,
          fileId: input.fileId,
          entity: "client",
          entityId: clientId,
          visibility: "client",
          addedBy: ctx.userId,
        },
        select: { id: true, createdAt: true },
      })
      const client = await prisma.client.findFirst({
        where: { id: clientId, organizationId: ctx.organizationId },
        select: { name: true },
      })
      await recordUserAudit(ctx, {
        action: AUDIT_ACTIONS.clientDocumentLinked,
        entityType: "client",
        entityId: clientId,
        entityLabel: client?.name ?? input.name,
        after: { fileName: input.name },
      })
      return { id: link.id, createdAt: link.createdAt.toISOString() }
    }
    default:
      throw new NotFoundError("Domain operation")
  }
}
