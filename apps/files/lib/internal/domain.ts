import { z } from "zod"

import type {
  DelegatedContext,
  DomainCall,
  DomainOperation,
} from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { rolesFrom } from "@workspace/core/roles"
import { NotFoundError } from "@workspace/core/errors"
import {
  createFilesSchema,
  createFolderSchema,
  finalizeUploadSchema,
  moveFileSchema,
  renameFileSchema,
} from "@workspace/files/schemas"

import { fileService, orgQuotaBytes, orgUsedBytes } from "@/lib/files"

function requestContext(context: DelegatedContext): RequestContext {
  return {
    userId: context.userId,
    userName: context.userName,
    userEmail: context.userEmail,
    organizationId: context.organizationId,
    roles: rolesFrom(context),
  }
}

const fileInput = z.object({ fileId: z.string().min(1) })

export async function dispatchDomain(
  operation: DomainOperation,
  call: DomainCall
): Promise<unknown> {
  const ctx = requestContext(call.context)

  switch (operation) {
    case "list-files":
      return fileService.list(ctx)
    case "create-folder":
      return fileService.createFolder(ctx, createFolderSchema.parse(call.input))
    case "create-files":
      return fileService.createFiles(ctx, createFilesSchema.parse(call.input))
    case "rename-file": {
      const input = z
        .object({ fileId: z.string().min(1) })
        .extend(renameFileSchema.shape)
        .parse(call.input)
      const { fileId, ...rest } = input
      return fileService.renameFile(ctx, fileId, rest)
    }
    case "move-file": {
      const input = z
        .object({ fileId: z.string().min(1) })
        .extend(moveFileSchema.shape)
        .parse(call.input)
      const { fileId, ...rest } = input
      return fileService.moveFile(ctx, fileId, rest)
    }
    case "trash-file":
      return fileService.trashFile(ctx, fileInput.parse(call.input).fileId)
    case "create-uploaded-file":
      return fileService.createUploadedFile(
        ctx,
        finalizeUploadSchema.parse(call.input)
      )
    case "list-file-options": {
      const data = await fileService.list(ctx)
      return data.files
        .filter((file) => !file.trashed && file.kind !== "folder")
        .map((file) => ({
          id: file.id,
          name: file.name,
          kind: file.kind,
          mimeType: file.mimeType ?? null,
          sizeBytes: file.sizeBytes ?? null,
          trashed: file.trashed,
          modifiedAt: file.modifiedAt,
        }))
    }
    case "find-file": {
      const data = await fileService.list(ctx)
      const file = data.files.find(
        (candidate) => candidate.id === fileInput.parse(call.input).fileId
      )
      return file
        ? {
            id: file.id,
            name: file.name,
            kind: file.kind,
            mimeType: file.mimeType ?? null,
            sizeBytes: file.sizeBytes ?? null,
            trashed: file.trashed,
            modifiedAt: file.modifiedAt,
          }
        : null
    }
    case "find-files-by-ids": {
      const { ids } = z
        .object({ ids: z.array(z.string().min(1)).max(500) })
        .parse(call.input)
      const data = await fileService.list(ctx)
      const wanted = new Set(ids)
      return data.files
        .filter((file) => wanted.has(file.id))
        .map((file) => ({
          id: file.id,
          name: file.name,
          kind: file.kind,
          mimeType: file.mimeType ?? null,
          sizeBytes: file.sizeBytes ?? null,
          trashed: file.trashed,
          modifiedAt: file.modifiedAt,
        }))
    }
    case "get-storage-usage":
      return { usedBytes: await orgUsedBytes(ctx.organizationId) }
    case "get-file-quota": {
      const [quotaBytes, usedBytes] = await Promise.all([
        orgQuotaBytes(ctx.organizationId),
        orgUsedBytes(ctx.organizationId),
      ])
      return { quotaBytes, usedBytes }
    }
    default:
      throw new NotFoundError("Domain operation")
  }
}
