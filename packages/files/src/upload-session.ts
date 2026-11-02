import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import type { RequestContext } from "@workspace/core/context"
import { roleRank } from "@workspace/organization/roles"

import type { FileQuota, FileStorage } from "./deps"
import { kindFromName } from "./file-utils"
import type { FileService } from "./service"
import { uploadSessionExpiry } from "./upload-config"
import type { FileNode } from "./types"

const OPEN = "open"
const COMPLETE = "complete"
const ABORTED = "aborted"
const UPLOAD_SESSIONS_PER_HOUR = 1000

function canWrite(ctx: RequestContext) {
  if (roleRank(ctx.role) >= 2) return
  throw new ForbiddenError("Your role cannot modify files.", {
    code: "role_cannot_modify_files",
  })
}

export interface CreateUploadSessionInput {
  name: string
  parentId: string | null
  mimeType?: string
  expectedSize?: number
  transient?: boolean
}

export interface UploadSessionView {
  uploadId: string
  oid: number
  receivedBytes: number
  expectedSize: number | null
}

export interface CompletedUpload {
  oid: number
  size: number
  sha256: string
  name: string
  mimeType: string | null
  kind: string
  file: FileNode | null
}

/** Shared fixed-window limiter bound to the owning app's rate-limit table. */
export type UploadRateLimit = (
  key: string,
  limit: number,
  windowMs: number,
  options: { failOpen: boolean }
) => Promise<void>

/**
 * Returns the oid strings a completed file, file version or message
 * attachment already references. The files app binds the file/version query;
 * attachment bytes belong to the messages app, so the caller supplies them.
 */
export type UploadReferenceChecker = (oids: bigint[]) => Promise<string[]>

export interface UploadSessionRow {
  id: string
  organizationId: string
  userId: string
  name: string
  parentId: string | null
  kind: string
  mimeType: string | null
  oid: bigint
  expectedSize: number | null
  receivedBytes: number
  sha256: string | null
  transient: boolean
  status: string
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
}

/**
 * Only the upload-session table. The files app and the messages app each own
 * one in their own database, so the port carries no other model.
 */
export interface UploadSessionDb {
  uploadSession: {
    findFirst(args: {
      where: { id: string; organizationId: string }
    }): Promise<UploadSessionRow | null>
    findMany(args: {
      where: { status: string; expiresAt: { lt: Date } }
      select: { id: true; oid: true }
      take: number
    }): Promise<{ id: string; oid: bigint }[]>
    create(args: {
      data: {
        organizationId: string
        userId: string
        name: string
        parentId: string | null
        kind: string
        mimeType?: string
        oid: number
        expectedSize?: number
        transient: boolean
        expiresAt: Date
      }
    }): Promise<UploadSessionRow>
    update(args: {
      where: { id: string }
      data: {
        receivedBytes?: number
        sha256?: string
        expiresAt?: Date
        status?: string
      }
      select?: { receivedBytes: true }
    }): Promise<{ receivedBytes: number }>
    updateMany(args: {
      where: { id: string; status: string }
      data: { status: string }
    }): Promise<{ count: number }>
  }
}

export interface UploadSessionDeps {
  db: UploadSessionDb
  storage: FileStorage
  quota: FileQuota
  /** Required for workspace files; a transient-only app (messages) omits it. */
  fileService?: FileService
  assertRateLimit: UploadRateLimit
  referencedOids: UploadReferenceChecker
}

/**
 * Chunked upload sessions (ADR 0010).
 *
 * A session owns one large object. Chunks must arrive in order and the object
 * is only attached to a file on completion, so an aborted or expired upload
 * never leaves a row behind that a reader can see.
 */
export class UploadSessionService {
  constructor(private readonly deps: UploadSessionDeps) {}

  private get db() {
    return this.deps.db
  }

  private async loadSession(
    ctx: RequestContext,
    uploadId: string
  ): Promise<UploadSessionRow> {
    const session = await this.db.uploadSession.findFirst({
      where: { id: uploadId, organizationId: ctx.organizationId },
    })
    if (!session) throw new NotFoundError("Upload")
    if (session.userId !== ctx.userId && ctx.role !== "owner") {
      throw new NotFoundError("Upload")
    }
    return session
  }

  /** Unlink the large objects of sessions whose lease has expired. */
  async sweepExpiredUploadSessions(): Promise<void> {
    const expired = await this.db.uploadSession.findMany({
      where: { status: OPEN, expiresAt: { lt: new Date() } },
      select: { id: true, oid: true },
      take: 100,
    })
    if (expired.length === 0) return

    // Safety net: never unlink a large object that a completed file already
    // references. This covers the tiny window where a session was finalized but
    // its status update failed.
    const referenced = new Set(
      await this.deps.referencedOids(expired.map((session) => session.oid))
    )

    for (const session of expired) {
      const isReferenced = referenced.has(session.oid.toString())
      await this.db.uploadSession.updateMany({
        where: { id: session.id, status: OPEN },
        data: { status: isReferenced ? COMPLETE : ABORTED },
      })
      if (isReferenced) continue
      await this.deps.storage
        .unlink(Number(session.oid))
        .catch((error: unknown) =>
          console.error(
            `[uploads] failed to unlink expired large object ${session.oid}`,
            error
          )
        )
    }
  }

  async createUploadSession(
    ctx: RequestContext,
    input: CreateUploadSessionInput
  ): Promise<UploadSessionView> {
    canWrite(ctx)
    // Generous enough for a large folder drop; stops scripted session floods.
    await this.deps.assertRateLimit(
      `uploads:${ctx.organizationId}`,
      UPLOAD_SESSIONS_PER_HOUR,
      60 * 60_000,
      { failOpen: true }
    )
    await this.sweepExpiredUploadSessions()

    const [quota, used] = await Promise.all([
      this.deps.quota.quotaBytes(ctx.organizationId),
      this.deps.quota.usedBytes(ctx.organizationId),
    ])
    const remaining = Math.max(0, quota - used)
    if (remaining <= 0) {
      throw new ForbiddenError("Storage quota exceeded.", {
        code: "storage_quota_exceeded",
      })
    }
    if (input.expectedSize !== undefined && input.expectedSize > remaining) {
      throw new ForbiddenError("Storage quota exceeded.", {
        code: "storage_quota_exceeded",
      })
    }

    const oid = await this.deps.storage.create()
    try {
      const session = await this.db.uploadSession.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          name: input.name,
          parentId: input.parentId,
          kind: kindFromName(input.name),
          mimeType: input.mimeType,
          oid,
          expectedSize: input.expectedSize,
          transient: input.transient ?? false,
          expiresAt: uploadSessionExpiry(),
        },
      })
      return {
        uploadId: session.id,
        oid,
        receivedBytes: 0,
        expectedSize: session.expectedSize,
      }
    } catch (error) {
      await this.deps.storage.unlink(oid).catch(() => undefined)
      throw error
    }
  }

  /**
   * Append one chunk. `offset` must equal the bytes already received so chunks
   * cannot be reordered, duplicated, or leave gaps.
   */
  async appendUploadChunk(
    ctx: RequestContext,
    uploadId: string,
    offset: number,
    chunk: Buffer
  ): Promise<{ receivedBytes: number }> {
    canWrite(ctx)
    const session = await this.loadSession(ctx, uploadId)

    if (session.status !== OPEN) throw new NotFoundError("Upload")
    if (session.expiresAt.getTime() < Date.now()) {
      throw new NotFoundError("Upload")
    }
    if (offset !== session.receivedBytes) {
      throw new ForbiddenError("Chunk offset does not match the upload.", {
        code: "upload_offset_mismatch",
      })
    }
    if (
      session.expectedSize !== null &&
      session.receivedBytes + chunk.length > session.expectedSize
    ) {
      throw new ForbiddenError("Upload exceeds the declared size.", {
        code: "upload_size_mismatch",
      })
    }

    const size = await this.deps.storage.append(Number(session.oid), chunk)
    const updated = await this.db.uploadSession.update({
      where: { id: session.id },
      data: { receivedBytes: size, expiresAt: uploadSessionExpiry() },
      select: { receivedBytes: true },
    })
    return { receivedBytes: updated.receivedBytes }
  }

  async getUploadSession(
    ctx: RequestContext,
    uploadId: string
  ): Promise<UploadSessionView> {
    canWrite(ctx)
    const session = await this.loadSession(ctx, uploadId)
    return {
      uploadId: session.id,
      oid: Number(session.oid),
      receivedBytes: session.receivedBytes,
      expectedSize: session.expectedSize,
    }
  }

  private async discardSession(id: string, oid: number): Promise<void> {
    await this.db.uploadSession.update({
      where: { id },
      data: { status: ABORTED },
    })
    await this.deps.storage
      .unlink(oid)
      .catch((error: unknown) =>
        console.error(`[uploads] failed to unlink large object ${oid}`, error)
      )
  }

  /**
   * Finalize an upload: validate the stored bytes, then create the file (or, for
   * a transient message attachment, return the large-object reference for the
   * caller to persist later).
   */
  async completeUploadSession(
    ctx: RequestContext,
    uploadId: string
  ): Promise<CompletedUpload> {
    canWrite(ctx)
    const session = await this.loadSession(ctx, uploadId)

    if (session.status !== OPEN) throw new NotFoundError("Upload")

    const oid = Number(session.oid)
    const { size, sha256 } = await this.deps.storage.hash(oid)

    if (session.expectedSize !== null && size !== session.expectedSize) {
      await this.discardSession(session.id, oid)
      throw new ForbiddenError(
        "Uploaded size did not match the declared size.",
        {
          code: "upload_size_mismatch",
        }
      )
    }
    if (session.sha256 && session.sha256 !== sha256) {
      await this.discardSession(session.id, oid)
      throw new ForbiddenError("Uploaded checksum did not match.", {
        code: "upload_checksum_mismatch",
      })
    }

    let file: FileNode | null = null
    if (!session.transient) {
      if (!this.deps.fileService) {
        throw new ForbiddenError(
          "This app only accepts transient uploads.",
          { code: "upload_not_transient" }
        )
      }
      try {
        await this.deps.fileService.assertUploadAccess(ctx, session.parentId)
        file = await this.deps.fileService.createUploadedFile(ctx, {
          name: session.name,
          parentId: session.parentId,
          sizeBytes: size,
          mimeType: session.mimeType ?? undefined,
          oid,
          sha256,
        })
      } catch (error) {
        await this.discardSession(session.id, oid)
        throw error
      }
    }

    await this.db.uploadSession.update({
      where: { id: session.id },
      data: { status: COMPLETE, sha256, receivedBytes: size },
    })

    return {
      oid,
      size,
      sha256,
      name: session.name,
      mimeType: session.mimeType,
      kind: session.kind,
      file,
    }
  }

  async abortUploadSession(
    ctx: RequestContext,
    uploadId: string
  ): Promise<void> {
    canWrite(ctx)
    const session = await this.loadSession(ctx, uploadId)
    if (session.status !== OPEN) return
    await this.discardSession(session.id, Number(session.oid))
  }
}
