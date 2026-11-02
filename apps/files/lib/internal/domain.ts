import { z } from "zod"

import type {
  DelegatedContext,
  DomainCall,
  DomainOperation,
} from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
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
    role: context.role,
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
