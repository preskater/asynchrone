"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"
import { revalidateOrgPath } from "@/lib/organization/paths"
import { fileService } from "@/lib/files"
import {
  addShareSchema,
  bulkFileIdsSchema,
  createFilesSchema,
  createFolderSchema,
  moveFileSchema,
  removeShareSchema,
  renameFileSchema,
  setFileRestrictedSchema,
  updateShareSchema,
} from "@workspace/files/schemas"

export const listFilesAction = withAction(async () => {
  const ctx = await getRequestContext()
  return fileService.list(ctx)
})

export const createFolderAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(createFolderSchema, input)
  const folder = await fileService.createFolder(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return folder
})

export const createFilesAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(createFilesSchema, input)
  const files = await fileService.createFiles(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return files
})

export const renameFileAction = withAction(async (id: string, input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(renameFileSchema, input)
  const file = await fileService.renameFile(ctx, id, parsed)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return file
})

export const moveFileAction = withAction(async (id: string, input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(moveFileSchema, input)
  const file = await fileService.moveFile(ctx, id, parsed)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return file
})

export const duplicateFileAction = withAction(async (id: string) => {
  const ctx = await getRequestContext()
  const file = await fileService.duplicateFile(ctx, id)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return file
})

export const toggleStarAction = withAction(async (id: string) => {
  const ctx = await getRequestContext()
  const file = await fileService.toggleStar(ctx, id)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return file
})

export const trashFileAction = withAction(async (id: string) => {
  const ctx = await getRequestContext()
  const file = await fileService.trashFile(ctx, id)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return file
})

export const restoreFileAction = withAction(async (id: string) => {
  const ctx = await getRequestContext()
  const file = await fileService.restoreFile(ctx, id)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return file
})

export const deleteFileAction = withAction(async (id: string) => {
  const ctx = await getRequestContext()
  const result = await fileService.deleteForever(ctx, id)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return result
})

export const bulkTrashAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const { ids } = await parseLocalized(bulkFileIdsSchema, input)
  const result = await fileService.moveToTrashMany(ctx, ids)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return result
})

export const bulkRestoreAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const { ids } = await parseLocalized(bulkFileIdsSchema, input)
  const result = await fileService.restoreMany(ctx, ids)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return result
})

export const bulkDeleteAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const { ids } = await parseLocalized(bulkFileIdsSchema, input)
  const result = await fileService.deleteMany(ctx, ids)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return result
})

export const addShareAction = withAction(async (id: string, input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(addShareSchema, input)
  const shares = await fileService.addShare(ctx, id, parsed)
  await revalidateOrgPath(ctx.organizationId, "/files")
  return shares
})

export const updateShareAction = withAction(
  async (id: string, input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(updateShareSchema, input)
    const shares = await fileService.updateShare(ctx, id, parsed)
    await revalidateOrgPath(ctx.organizationId, "/files")
    return shares
  }
)

export const removeShareAction = withAction(
  async (id: string, input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(removeShareSchema, input)
    const shares = await fileService.removeShare(ctx, id, parsed)
    await revalidateOrgPath(ctx.organizationId, "/files")
    return shares
  }
)

export const setFileRestrictedAction = withAction(
  async (id: string, input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(setFileRestrictedSchema, input)
    const file = await fileService.setRestricted(ctx, id, parsed.restricted)
    await revalidateOrgPath(ctx.organizationId, "/files")
    return file
  }
)
