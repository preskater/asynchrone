import { z } from "zod"

export const fileLocationSchema = z.enum([
  "my-files",
  "shared",
  "recent",
  "favorites",
  "trash",
])

export const sharePermissionSchema = z.enum(["view", "comment", "edit"])

export const createFolderSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
})

export const createFilesSchema = z.object({
  parentId: z.string().nullable().optional(),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        sizeBytes: z.number().int().nonnegative().default(0),
        mimeType: z.string().max(255).optional(),
        oid: z.number().int().nonnegative().optional(),
        sha256: z.string().max(64).optional(),
      })
    )
    .min(1),
})

export const finalizeUploadSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
  sizeBytes: z.number().int().nonnegative().default(0),
  mimeType: z.string().max(255).optional(),
  oid: z.number().int().positive(),
  sha256: z.string().max(64),
})

export const renameFileSchema = z.object({
  name: z.string().min(1).max(200),
})

export const moveFileSchema = z.object({
  parentId: z.string().nullable(),
})

export const addShareSchema = z.object({
  memberId: z.string().min(1),
  permission: sharePermissionSchema,
})

export const updateShareSchema = z.object({
  memberId: z.string().min(1),
  permission: sharePermissionSchema,
})

export const removeShareSchema = z.object({
  memberId: z.string().min(1),
})

export const bulkFileIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
})

export const setFileRestrictedSchema = z.object({
  restricted: z.boolean(),
})

export type CreateFolderInput = z.infer<typeof createFolderSchema>
export type CreateFilesInput = z.infer<typeof createFilesSchema>
export type FinalizeUploadInput = z.infer<typeof finalizeUploadSchema>
export type RenameFileInput = z.infer<typeof renameFileSchema>
export type MoveFileInput = z.infer<typeof moveFileSchema>
export type AddShareInput = z.infer<typeof addShareSchema>
export type UpdateShareInput = z.infer<typeof updateShareSchema>
export type RemoveShareInput = z.infer<typeof removeShareSchema>
export type BulkFileIdsInput = z.infer<typeof bulkFileIdsSchema>
export type SetFileRestrictedInput = z.infer<typeof setFileRestrictedSchema>
