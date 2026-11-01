import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import type { RequestContext } from "@workspace/core/context"
import { assertRateLimit } from "@/lib/core/rate-limit"
import {
  appendLargeObject,
  createLargeObject,
  hashLargeObject,
  unlinkLargeObject,
} from "@/lib/large-object"
import { roleRank } from "@workspace/organization/roles"
import { prisma } from "@/lib/prisma"

import { kindFromName } from "./file-utils"
import { fileService } from "./index"
import { orgQuotaBytes, orgUsedBytes } from "./storage"
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

type UploadSessionRow = Awaited<
  ReturnType<typeof prisma.uploadSession.findFirstOrThrow>
>

async function loadSession(
  ctx: RequestContext,
  uploadId: string
): Promise<UploadSessionRow> {
  const session = await prisma.uploadSession.findFirst({
    where: { id: uploadId, organizationId: ctx.organizationId },
  })
  if (!session) throw new NotFoundError("Upload")
  if (session.userId !== ctx.userId && ctx.role !== "owner") {
    throw new NotFoundError("Upload")
  }
  return session
}

/** Unlink the large objects of sessions whose lease has expired. */
export async function sweepExpiredUploadSessions(): Promise<void> {
  const expired = await prisma.uploadSession.findMany({
    where: { status: OPEN, expiresAt: { lt: new Date() } },
    select: { id: true, oid: true },
    take: 100,
  })
  if (expired.length === 0) return

  // Safety net: never unlink a large object that a completed file already
  // references. This covers the tiny window where a session was finalized but
  // its status update failed.
  const oids = expired.map((session) => session.oid)
  const [files, versions, attachments] = await Promise.all([
    prisma.fileNode.findMany({
      where: { oid: { in: oids } },
      select: { oid: true },
    }),
    prisma.fileVersion.findMany({
      where: { oid: { in: oids } },
      select: { oid: true },
    }),
    prisma.messageAttachment.findMany({
      where: { oid: { in: oids } },
      select: { oid: true },
    }),
  ])
  const referenced = new Set(
    [...files, ...versions, ...attachments]
      .map((row) => row.oid)
      .filter((oid): oid is bigint => oid !== null)
      .map((oid) => oid.toString())
  )

  for (const session of expired) {
    const isReferenced = referenced.has(session.oid.toString())
    await prisma.uploadSession.updateMany({
      where: { id: session.id, status: OPEN },
      data: { status: isReferenced ? COMPLETE : ABORTED },
    })
    if (isReferenced) continue
    await unlinkLargeObject(Number(session.oid)).catch((error) =>
      console.error(
        `[uploads] failed to unlink expired large object ${session.oid}`,
        error
      )
    )
  }
}

export async function createUploadSession(
  ctx: RequestContext,
  input: CreateUploadSessionInput
): Promise<UploadSessionView> {
  canWrite(ctx)
  // Generous enough for a large folder drop; stops scripted session floods.
  await assertRateLimit(
    `uploads:${ctx.organizationId}`,
    UPLOAD_SESSIONS_PER_HOUR,
    60 * 60_000,
    { failOpen: true }
  )
  await sweepExpiredUploadSessions()

  const [quota, used] = await Promise.all([
    orgQuotaBytes(ctx.organizationId),
    orgUsedBytes(ctx.organizationId),
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

  const oid = await createLargeObject()
  try {
    const session = await prisma.uploadSession.create({
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
    await unlinkLargeObject(oid).catch(() => undefined)
    throw error
  }
}

/**
 * Append one chunk. `offset` must equal the bytes already received so chunks
 * cannot be reordered, duplicated, or leave gaps.
 */
export async function appendUploadChunk(
  ctx: RequestContext,
  uploadId: string,
  offset: number,
  chunk: Buffer
): Promise<{ receivedBytes: number }> {
  canWrite(ctx)
  const session = await loadSession(ctx, uploadId)

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

  const size = await appendLargeObject(Number(session.oid), chunk)
  const updated = await prisma.uploadSession.update({
    where: { id: session.id },
    data: { receivedBytes: size, expiresAt: uploadSessionExpiry() },
    select: { receivedBytes: true },
  })
  return { receivedBytes: updated.receivedBytes }
}

export async function getUploadSession(
  ctx: RequestContext,
  uploadId: string
): Promise<UploadSessionView> {
  canWrite(ctx)
  const session = await loadSession(ctx, uploadId)
  return {
    uploadId: session.id,
    oid: Number(session.oid),
    receivedBytes: session.receivedBytes,
    expectedSize: session.expectedSize,
  }
}

async function discardSession(id: string, oid: number): Promise<void> {
  await prisma.uploadSession.update({
    where: { id },
    data: { status: ABORTED },
  })
  await unlinkLargeObject(oid).catch((error) =>
    console.error(`[uploads] failed to unlink large object ${oid}`, error)
  )
}

/**
 * Finalize an upload: validate the stored bytes, then create the file (or, for
 * a transient message attachment, return the large-object reference for the
 * caller to persist later).
 */
export async function completeUploadSession(
  ctx: RequestContext,
  uploadId: string
): Promise<CompletedUpload> {
  canWrite(ctx)
  const session = await loadSession(ctx, uploadId)

  if (session.status !== OPEN) throw new NotFoundError("Upload")

  const oid = Number(session.oid)
  const { size, sha256 } = await hashLargeObject(oid)

  if (session.expectedSize !== null && size !== session.expectedSize) {
    await discardSession(session.id, oid)
    throw new ForbiddenError("Uploaded size did not match the declared size.", {
      code: "upload_size_mismatch",
    })
  }
  if (session.sha256 && session.sha256 !== sha256) {
    await discardSession(session.id, oid)
    throw new ForbiddenError("Uploaded checksum did not match.", {
      code: "upload_checksum_mismatch",
    })
  }

  let file: FileNode | null = null
  if (!session.transient) {
    try {
      await fileService.assertUploadAccess(ctx, session.parentId)
      file = await fileService.createUploadedFile(ctx, {
        name: session.name,
        parentId: session.parentId,
        sizeBytes: size,
        mimeType: session.mimeType ?? undefined,
        oid,
        sha256,
      })
    } catch (error) {
      await discardSession(session.id, oid)
      throw error
    }
  }

  await prisma.uploadSession.update({
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

export async function abortUploadSession(
  ctx: RequestContext,
  uploadId: string
): Promise<void> {
  canWrite(ctx)
  const session = await loadSession(ctx, uploadId)
  if (session.status !== OPEN) return
  await discardSession(session.id, Number(session.oid))
}
