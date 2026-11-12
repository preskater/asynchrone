import { z } from "zod"

import { AUDIT_ACTIONS } from "@workspace/audit"
import type {
  DelegatedContext,
  DomainCall,
  DomainOperation,
} from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { rolesFrom } from "@workspace/core/roles"
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
import { clientFiles } from "@/lib/clients/ports"
import { memberDirectory } from "@/lib/identity"
import { recordUserAudit } from "@/lib/audit"
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

const clientBasicsInput = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(200),
  contactEmail: z.string().email().nullable().optional(),
  isActive: z.boolean(),
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
    case "list-client-directory": {
      return prisma.client.findMany({
        where: { organizationId: ctx.organizationId },
        select: {
          id: true,
          name: true,
          contactEmail: true,
          isActive: true,
        },
        orderBy: { name: "asc" },
      })
    }
    case "save-client-basics": {
      const input = clientBasicsInput.parse(call.input)
      const data = {
        name: input.name,
        contactEmail: input.contactEmail ?? null,
        isActive: input.isActive,
      }
      const row = input.id
        ? await prisma.client.update({ where: { id: input.id }, data })
        : await prisma.client.create({
            data: { ...data, organizationId: ctx.organizationId },
          })
      return {
        id: row.id,
        name: row.name,
        contactEmail: row.contactEmail,
        isActive: row.isActive,
      }
    }
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
        },
        select: {
          id: true,
          fileId: true,
          addedBy: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      })
      const [files, members] = await Promise.all([
        clientFiles.byIds(
          ctx,
          links.map((link) => link.fileId)
        ),
        memberDirectory.list(ctx.organizationId),
      ])
      const fileById = new Map(files.map((file) => [file.id, file]))
      const nameById = new Map(
        members.map((member) => [member.userId, member.name])
      )
      return links.flatMap((link) => {
        const file = fileById.get(link.fileId)
        if (!file || file.trashed) return []
        return [
          {
            id: link.id,
            fileId: link.fileId,
            name: file.name,
            sizeBytes: file.sizeBytes ?? undefined,
            createdAt: link.createdAt.toISOString(),
            addedByName: nameById.get(link.addedBy),
          },
        ]
      })
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
        select: { id: true },
      })
      if (!link) return null
      const file = await clientFiles.find(ctx, fileId)
      if (!file) return null
      return {
        name: file.name,
        mimeType: file.mimeType ?? undefined,
        trashed: file.trashed,
        sizeBytes: file.sizeBytes ?? undefined,
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
