import { AUDIT_ACTIONS } from "@/lib/audit/actions"
import { recordUserAudit, recordUserAuditMany } from "@/lib/audit/record"
import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import type { RequestContext } from "@workspace/core/context"
import {
  openLargeObjectStream,
  unlinkLargeObject,
  uploadLargeObject,
} from "@/lib/large-object"
import { requireEntitlement } from "@/lib/organization/entitlements"
import { roleRank } from "@workspace/organization/roles"

import { kindFromName } from "./file-utils"
import { FileRepository } from "./repository"
import { orgQuotaBytes, orgUsedBytes } from "./storage"
import type {
  CreateFilesInput,
  CreateFolderInput,
  FinalizeUploadInput,
  MoveFileInput,
  RenameFileInput,
  AddShareInput,
  UpdateShareInput,
  RemoveShareInput,
} from "./schemas"
import type {
  FileActivity,
  FileKind,
  FileNode,
  FileVersion,
  FilesData,
  ShareEntry,
} from "./types"

const PERMISSION_RANK: Record<string, number> = {
  view: 1,
  comment: 2,
  edit: 3,
}

const VIEW_RANK = 1
const EDIT_RANK = 3

function canWrite(ctx: RequestContext) {
  if (roleRank(ctx.role) >= 2) return
  throw new ForbiddenError("Your role cannot modify files.", {
    code: "role_cannot_modify_files",
  })
}

type FileRow = Awaited<ReturnType<FileRepository["list"]>>[number]
type AncestorNode = Awaited<
  ReturnType<FileRepository["findAncestorChain"]>
>[number]

interface FileAccess {
  canRead: boolean
  canWrite: boolean
}

/**
 * Resolve what the current user may do with a file/folder from its ancestor
 * chain (the node itself followed by each parent).
 *
 * - Owners see and edit everything.
 * - The file's owner controls their own file.
 * - A restricted node hides itself and its subtree from everyone without an
 *   explicit share on that node or an ancestor.
 * - Non-restricted files are readable org-wide; writing still requires the
 *   member role (viewers are read-only).
 */
function resolveAccess(ctx: RequestContext, chain: AncestorNode[]): FileAccess {
  if (ctx.role === "owner") return { canRead: true, canWrite: true }
  if (chain.some((node) => node.ownerId === ctx.userId)) {
    return { canRead: true, canWrite: true }
  }

  let granted = 0
  for (const node of chain) {
    for (const share of node.shares) {
      if (share.userId === ctx.userId) {
        granted = Math.max(granted, PERMISSION_RANK[share.permission] ?? 0)
      }
    }
  }

  const restricted = chain.some((node) => node.restricted)
  const canRead = granted >= VIEW_RANK || !restricted
  const canWrite =
    roleRank(ctx.role) >= 2 && (granted >= EDIT_RANK || !restricted)

  return { canRead, canWrite }
}

export class FileService {
  constructor(private readonly repo: FileRepository) {}

  private mapFile(row: FileRow): FileNode {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as FileKind,
      parentId: row.parentId,
      ownerId: row.ownerId,
      modifiedAt: row.modifiedAt.toISOString(),
      sizeBytes: row.sizeBytes ?? undefined,
      mimeType: row.mimeType ?? undefined,
      hasStorage: row.oid !== null,
      starred: row.starred,
      trashed: row.trashed,
      trashedAt: row.trashedAt?.toISOString(),
      shared: row.shared,
      restricted: row.restricted,
    }
  }

  private mapShares(row: FileRow): ShareEntry[] {
    return row.shares.map((share) => ({
      memberId: share.userId,
      permission: share.permission as ShareEntry["permission"],
    }))
  }

  private mapVersions(row: FileRow): FileVersion[] {
    return row.versions.map((version) => ({
      id: version.id,
      memberId: version.userId,
      at: version.at.toISOString(),
      note: version.note,
      sizeBytes: version.sizeBytes ?? undefined,
      hasStorage: version.oid !== null,
    }))
  }

  private mapActivities(row: FileRow): FileActivity[] {
    return row.activities.map((activity) => ({
      id: activity.id,
      memberId: activity.userId,
      action: activity.action,
      at: activity.at.toISOString(),
    }))
  }

  private async accessFor(
    ctx: RequestContext,
    id: string
  ): Promise<FileAccess> {
    const chain = await this.repo.findAncestorChain(ctx.organizationId, id)
    return resolveAccess(ctx, chain)
  }

  private async requireRead(ctx: RequestContext, id: string): Promise<FileRow> {
    const row = await this.repo.findById(ctx.organizationId, id)
    if (!row) throw new NotFoundError("File")
    const access = await this.accessFor(ctx, id)
    if (!access.canRead) throw new NotFoundError("File")
    return row
  }

  private async requireWrite(
    ctx: RequestContext,
    id: string
  ): Promise<FileRow> {
    canWrite(ctx)
    const row = await this.repo.findById(ctx.organizationId, id)
    if (!row) throw new NotFoundError("File")
    const access = await this.accessFor(ctx, id)
    if (!access.canWrite) {
      throw new ForbiddenError(
        "You do not have permission to modify this file.",
        { code: "file_permission_denied" }
      )
    }
    return row
  }

  private async requireParentWrite(
    ctx: RequestContext,
    parentId: string | null | undefined
  ): Promise<void> {
    if (!parentId) return
    await this.requireWrite(ctx, parentId)
  }

  /**
   * Validate that the caller may start/complete an upload into `parentId`.
   * Used before bytes are accepted so an unauthorized upload never creates a
   * large object.
   */
  async assertUploadAccess(
    ctx: RequestContext,
    parentId: string | null | undefined
  ): Promise<void> {
    canWrite(ctx)
    await this.requireParentWrite(ctx, parentId)
  }

  async list(ctx: RequestContext): Promise<FilesData> {
    const rows = await this.repo.list(ctx.organizationId)
    const byId = new Map(rows.map((row) => [row.id, row]))
    const cache = new Map<string, FileAccess>()
    const visible = rows.filter(
      (row) => this.accessFromMap(ctx, row.id, byId, cache).canRead
    )
    const shares: Record<string, ShareEntry[]> = {}
    const versions: Record<string, FileVersion[]> = {}
    const activities: Record<string, FileActivity[]> = {}
    for (const row of visible) {
      shares[row.id] = this.mapShares(row)
      versions[row.id] = this.mapVersions(row)
      activities[row.id] = this.mapActivities(row)
    }
    return {
      files: visible.map((row) => this.mapFile(row)),
      shares,
      versions,
      activities,
    }
  }

  /**
   * Resolve access from an in-memory node map so folders can inherit from
   * their parents without extra queries.
   */
  private accessFromMap(
    ctx: RequestContext,
    id: string,
    byId: Map<string, FileRow>,
    cache: Map<string, FileAccess>
  ): FileAccess {
    const cached = cache.get(id)
    if (cached) return cached
    if (ctx.role === "owner") {
      const access = { canRead: true, canWrite: true }
      cache.set(id, access)
      return access
    }

    const row = byId.get(id)
    if (!row) {
      const access = { canRead: false, canWrite: false }
      cache.set(id, access)
      return access
    }

    if (row.ownerId === ctx.userId) {
      const access = { canRead: true, canWrite: true }
      cache.set(id, access)
      return access
    }

    let granted = 0
    for (const share of row.shares) {
      if (share.userId === ctx.userId) {
        granted = Math.max(granted, PERMISSION_RANK[share.permission] ?? 0)
      }
    }

    const parentAccess =
      row.parentId && byId.has(row.parentId)
        ? this.accessFromMap(ctx, row.parentId, byId, cache)
        : { canRead: true, canWrite: true }

    const canRead =
      granted >= VIEW_RANK || (!row.restricted && parentAccess.canRead)
    const canWrite =
      roleRank(ctx.role) >= 2 &&
      (granted >= EDIT_RANK || (!row.restricted && parentAccess.canWrite))

    const access = { canRead, canWrite }
    cache.set(id, access)
    return access
  }

  async get(ctx: RequestContext, id: string): Promise<FileNode> {
    const row = await this.requireRead(ctx, id)
    return this.mapFile(row)
  }

  async createFolder(
    ctx: RequestContext,
    input: CreateFolderInput
  ): Promise<FileNode> {
    canWrite(ctx)
    await this.requireParentWrite(ctx, input.parentId)
    const row = await this.repo.create({
      organizationId: ctx.organizationId,
      name: input.name.trim(),
      kind: "folder",
      parentId: input.parentId ?? null,
      ownerId: ctx.userId,
    })
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.fileFolderCreated,
      entityType: "file",
      entityId: row.id,
      entityLabel: row.name,
      after: { name: row.name, parentId: row.parentId },
    })
    return this.mapFile(row)
  }

  async createFiles(
    ctx: RequestContext,
    input: CreateFilesInput
  ): Promise<FileNode[]> {
    canWrite(ctx)
    await this.requireParentWrite(ctx, input.parentId)
    const rows = await this.repo.createMany(
      input.files.map((file) => ({
        organizationId: ctx.organizationId,
        name: file.name,
        kind: kindFromName(file.name),
        parentId: input.parentId ?? null,
        ownerId: ctx.userId,
        sizeBytes: file.sizeBytes,
        mimeType: file.mimeType,
        oid: file.oid,
        sha256: file.sha256,
      }))
    )
    await recordUserAuditMany(
      ctx,
      rows.map((row) => ({
        action: AUDIT_ACTIONS.fileCreated,
        entityType: "file",
        entityId: row.id,
        entityLabel: row.name,
        after: {
          name: row.name,
          sizeBytes: row.sizeBytes,
          mimeType: row.mimeType,
          parentId: row.parentId,
        },
      }))
    )
    return rows.map((row) => this.mapFile(row as FileRow))
  }

  async finalizeUpload(
    ctx: RequestContext,
    input: FinalizeUploadInput
  ): Promise<FileNode> {
    canWrite(ctx)
    await this.requireParentWrite(ctx, input.parentId)
    return this.createUploadedFile(ctx, input)
  }

  /**
   * Persist a completed upload (chunked or single-shot). Shared by the
   * `finalizeUpload` server action and the chunked-upload completion route.
   */
  async createUploadedFile(
    ctx: RequestContext,
    input: FinalizeUploadInput
  ): Promise<FileNode> {
    const row = await this.repo.create({
      organizationId: ctx.organizationId,
      name: input.name,
      kind: kindFromName(input.name),
      parentId: input.parentId ?? null,
      ownerId: ctx.userId,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      oid: input.oid,
      sha256: input.sha256,
    })
    await this.repo.addVersion({
      fileId: row.id,
      userId: ctx.userId,
      note: "Initial upload",
      oid: input.oid,
      mimeType: input.mimeType,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
    })
    await this.repo.addActivity(row.id, ctx.userId, "uploadedThisFile")
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.fileCreated,
      entityType: "file",
      entityId: row.id,
      entityLabel: row.name,
      after: {
        name: row.name,
        sizeBytes: row.sizeBytes,
        mimeType: row.mimeType,
        parentId: row.parentId,
      },
    })
    const withRelations = await this.repo.findById(ctx.organizationId, row.id)
    return this.mapFile((withRelations ?? row) as FileRow)
  }

  async renameFile(
    ctx: RequestContext,
    id: string,
    input: RenameFileInput
  ): Promise<FileNode> {
    const existing = await this.requireWrite(ctx, id)
    const row = await this.repo.update(id, {
      name: input.name.trim(),
      modifiedAt: new Date(),
    })
    await this.repo.addActivity(id, ctx.userId, "renamedThisFile")
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.fileRenamed,
      entityType: "file",
      entityId: id,
      entityLabel: row.name,
      before: { name: existing.name },
      after: { name: row.name },
    })
    return this.mapFile(row)
  }

  async moveFile(
    ctx: RequestContext,
    id: string,
    input: MoveFileInput
  ): Promise<FileNode> {
    const existing = await this.requireWrite(ctx, id)
    await this.requireParentWrite(ctx, input.parentId)
    const row = await this.repo.update(id, {
      parentId: input.parentId,
      modifiedAt: new Date(),
    })
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.fileMoved,
      entityType: "file",
      entityId: id,
      entityLabel: row.name,
      before: { parentId: existing.parentId },
      after: { parentId: row.parentId },
    })
    return this.mapFile(row)
  }

  async duplicateFile(ctx: RequestContext, id: string): Promise<FileNode> {
    canWrite(ctx)
    const source = await this.requireRead(ctx, id)
    await this.requireParentWrite(ctx, source.parentId)
    const dotIndex = source.name.lastIndexOf(".")
    const copyName =
      dotIndex > 0
        ? `${source.name.slice(0, dotIndex)} (copy)${source.name.slice(dotIndex)}`
        : `${source.name} (copy)`

    // A copy duplicates the bytes, so it has to respect the same storage quota
    // as an upload (`createUploadSession`).
    const opened =
      source.oid !== null
        ? await openLargeObjectStream(Number(source.oid))
        : null
    let copy: Awaited<ReturnType<typeof uploadLargeObject>> | null = null
    try {
      if (opened) {
        const [quota, used] = await Promise.all([
          orgQuotaBytes(ctx.organizationId),
          orgUsedBytes(ctx.organizationId),
        ])
        const copySize = source.sizeBytes ?? opened.size
        if (used + copySize > quota) {
          throw new ForbiddenError("Storage quota exceeded.", {
            code: "storage_quota_exceeded",
          })
        }
        // The copy needs its own large object: sharing the oid would let
        // deleting one file unlink the other's bytes.
        copy = await uploadLargeObject(opened.stream)
      }

      const row = await this.repo.create({
        organizationId: ctx.organizationId,
        name: copyName,
        kind: source.kind,
        parentId: source.parentId,
        ownerId: ctx.userId,
        sizeBytes: copy?.size,
        mimeType: source.mimeType ?? undefined,
        oid: copy?.oid,
        sha256: copy?.sha256,
        // The copy keeps the source's visibility: duplicating a restricted
        // file must not publish its bytes to the whole organization.
        restricted: source.restricted,
        shared: source.shared,
        shares: source.shares.map((share) => ({
          userId: share.userId,
          permission: share.permission,
        })),
      })
      await recordUserAudit(ctx, {
        action: AUDIT_ACTIONS.fileDuplicated,
        entityType: "file",
        entityId: row.id,
        entityLabel: row.name,
        before: { sourceFileId: source.id, sourceName: source.name },
        after: { name: row.name, parentId: row.parentId },
      })
      return this.mapFile(row)
    } catch (error) {
      opened?.stream.destroy()
      if (copy) await unlinkLargeObject(copy.oid).catch(() => undefined)
      throw error
    }
  }

  async toggleStar(ctx: RequestContext, id: string): Promise<FileNode> {
    const existing = await this.requireRead(ctx, id)
    const row = await this.repo.update(id, { starred: !existing.starred })
    return this.mapFile(row)
  }

  async trashFile(ctx: RequestContext, id: string): Promise<FileNode> {
    const existing = await this.requireWrite(ctx, id)
    const row = await this.repo.update(id, {
      trashed: true,
      trashedAt: new Date(),
    })
    await this.repo.addActivity(id, ctx.userId, "movedThisFileToTrash")
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.fileTrashed,
      entityType: "file",
      entityId: id,
      entityLabel: row.name,
      before: { trashed: existing.trashed },
      after: { trashed: row.trashed },
    })
    return this.mapFile(row)
  }

  async restoreFile(ctx: RequestContext, id: string): Promise<FileNode> {
    const existing = await this.requireWrite(ctx, id)
    const row = await this.repo.update(id, {
      trashed: false,
      trashedAt: null,
    })
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.fileRestored,
      entityType: "file",
      entityId: id,
      entityLabel: row.name,
      before: { trashed: existing.trashed },
    })
    return this.mapFile(row)
  }

  async deleteForever(
    ctx: RequestContext,
    id: string
  ): Promise<{ id: string }> {
    const row = await this.requireWrite(ctx, id)
    await this.repo.delete(id)
    await this.unlinkRows([row])
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.fileDeleted,
      entityType: "file",
      entityId: id,
      entityLabel: row.name,
      before: {
        name: row.name,
        sizeBytes: row.sizeBytes,
        parentId: row.parentId,
        ownerId: row.ownerId,
      },
    })
    return { id }
  }

  /**
   * Best-effort removal of the large objects backing a set of files and their
   * versions. Runs after the Prisma delete succeeded; failures are logged so a
   * missing/undecodable object never fails the request or leaks the rest.
   */
  private async unlinkRows(rows: FileRow[]): Promise<void> {
    const oids = new Set<string>()
    for (const row of rows) {
      if (row.oid !== null) oids.add(row.oid.toString())
      for (const version of row.versions) {
        if (version.oid !== null) oids.add(version.oid.toString())
      }
    }
    await Promise.all(
      Array.from(oids, (oid) =>
        unlinkLargeObject(Number(oid)).catch((error) =>
          console.error(`[files] failed to unlink large object ${oid}`, error)
        )
      )
    )
  }

  /** Validates write access to every id before a bulk change. */
  private async requireWrites(
    ctx: RequestContext,
    ids: string[]
  ): Promise<FileRow[]> {
    canWrite(ctx)
    return Promise.all(ids.map((id) => this.requireWrite(ctx, id)))
  }

  async moveToTrashMany(
    ctx: RequestContext,
    ids: string[]
  ): Promise<{ count: number }> {
    const rows = await this.requireWrites(ctx, ids)
    const result = await this.repo.updateMany(ids, {
      trashed: true,
      trashedAt: new Date(),
    })
    await recordUserAuditMany(
      ctx,
      rows.map((row) => ({
        action: AUDIT_ACTIONS.fileTrashed,
        entityType: "file",
        entityId: row.id,
        entityLabel: row.name,
        before: { trashed: row.trashed },
        after: { trashed: true },
      }))
    )
    return result
  }

  async restoreMany(
    ctx: RequestContext,
    ids: string[]
  ): Promise<{ count: number }> {
    const rows = await this.requireWrites(ctx, ids)
    const result = await this.repo.updateMany(ids, {
      trashed: false,
      trashedAt: null,
    })
    await recordUserAuditMany(
      ctx,
      rows.map((row) => ({
        action: AUDIT_ACTIONS.fileRestored,
        entityType: "file",
        entityId: row.id,
        entityLabel: row.name,
        before: { trashed: row.trashed },
        after: { trashed: false },
      }))
    )
    return result
  }

  async deleteMany(
    ctx: RequestContext,
    ids: string[]
  ): Promise<{ count: number }> {
    const rows = await this.requireWrites(ctx, ids)
    const result = await this.repo.deleteMany(ids)
    await this.unlinkRows(rows)
    await recordUserAuditMany(
      ctx,
      rows.map((row) => ({
        action: AUDIT_ACTIONS.fileDeleted,
        entityType: "file",
        entityId: row.id,
        entityLabel: row.name,
        before: { name: row.name, sizeBytes: row.sizeBytes },
      }))
    )
    return result
  }

  async sharesFor(ctx: RequestContext, id: string): Promise<ShareEntry[]> {
    const row = await this.requireRead(ctx, id)
    return this.mapShares(row)
  }

  async setRestricted(
    ctx: RequestContext,
    id: string,
    restricted: boolean
  ): Promise<FileNode> {
    const existing = await this.requireWrite(ctx, id)
    // Lifting a restriction stays allowed so a downgraded org can clean up.
    if (restricted)
      await requireEntitlement(ctx.organizationId, "granularPermissions")
    const row = await this.repo.update(id, { restricted })
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.fileAccessUpdated,
      entityType: "file",
      entityId: id,
      entityLabel: row.name,
      before: { restricted: existing.restricted },
      after: { restricted: row.restricted },
    })
    return this.mapFile(row)
  }

  async addShare(
    ctx: RequestContext,
    id: string,
    input: AddShareInput
  ): Promise<ShareEntry[]> {
    const file = await this.requireWrite(ctx, id)
    await requireEntitlement(ctx.organizationId, "granularPermissions")
    await this.repo.addShare(id, input.memberId, input.permission)
    await this.repo.update(id, { shared: true })
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.fileShareAdded,
      entityType: "file",
      entityId: id,
      entityLabel: file.name,
      after: { memberId: input.memberId, permission: input.permission },
    })
    const row = await this.repo.findById(ctx.organizationId, id)
    return row ? this.mapShares(row) : []
  }

  async updateShare(
    ctx: RequestContext,
    id: string,
    input: UpdateShareInput
  ): Promise<ShareEntry[]> {
    const file = await this.requireWrite(ctx, id)
    await requireEntitlement(ctx.organizationId, "granularPermissions")
    await this.repo.addShare(id, input.memberId, input.permission)
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.fileShareUpdated,
      entityType: "file",
      entityId: id,
      entityLabel: file.name,
      after: { memberId: input.memberId, permission: input.permission },
    })
    const row = await this.repo.findById(ctx.organizationId, id)
    return row ? this.mapShares(row) : []
  }

  async removeShare(
    ctx: RequestContext,
    id: string,
    input: RemoveShareInput
  ): Promise<ShareEntry[]> {
    const file = await this.requireWrite(ctx, id)
    await this.repo.removeShare(id, input.memberId)
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.fileShareRemoved,
      entityType: "file",
      entityId: id,
      entityLabel: file.name,
      before: { memberId: input.memberId },
    })
    const row = await this.repo.findById(ctx.organizationId, id)
    return row ? this.mapShares(row) : []
  }
}
