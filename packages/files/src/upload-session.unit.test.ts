import { describe, expect, it, vi } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import type { FileQuota, FileStorage } from "./deps"
import type { FileNode } from "./types"
import { UploadSessionService, type UploadSessionDeps } from "./upload-session"

const ctx: RequestContext = {
  userId: "user_1",
  userName: "Ada",
  userEmail: "ada@example.com",
  organizationId: "org_1",
  roles: ["owner"],
}

interface SessionRow {
  id: string
  organizationId: string
  userId: string
  name: string
  parentId: string | null
  kind: string
  mimeType: string | null
  oid: bigint
  sha256: string | null
  expectedSize: number | null
  receivedBytes: number
  transient: boolean
  status: string
  expiresAt: Date
}

const fileNode: FileNode = {
  id: "file_1",
  name: "plan.pdf",
  kind: "document",
  parentId: null,
  ownerId: "user_1",
  modifiedAt: "2026-11-01T00:00:00.000Z",
  sizeBytes: 4,
  mimeType: "application/pdf",
  hasStorage: true,
  starred: false,
  trashed: false,
  shared: false,
  restricted: false,
}

function build(session: Partial<SessionRow> = {}) {
  const rows = new Map<string, SessionRow>()
  const row: SessionRow = {
    id: "up_1",
    organizationId: "org_1",
    userId: "user_1",
    name: "plan.pdf",
    parentId: null,
    kind: "document",
    mimeType: "application/pdf",
    oid: 42n,
    sha256: null,
    expectedSize: 4,
    receivedBytes: 0,
    transient: false,
    status: "open",
    expiresAt: new Date(Date.now() + 60_000),
    ...session,
  }
  rows.set(row.id, row)

  const db = {
    uploadSession: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { id: string; organizationId: string }
        }) => {
          const found = rows.get(where.id)
          return found && found.organizationId === where.organizationId
            ? found
            : null
        }
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<SessionRow, "id" | "sha256" | "receivedBytes" | "status">
        }) => {
          const created: SessionRow = {
            ...data,
            id: "up_new",
            sha256: null,
            receivedBytes: 0,
            status: "open",
          }
          rows.set(created.id, created)
          return created
        }
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: object }) => {
          const found = rows.get(where.id)
          if (!found) throw new Error("missing session")
          Object.assign(found, data)
          return { receivedBytes: found.receivedBytes }
        }
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: string }; data: object }) => {
          const found = rows.get(where.id)
          if (!found) return { count: 0 }
          Object.assign(found, data)
          return { count: 1 }
        }
      ),
      findMany: vi.fn(async ({ where }: { where: { status: string } }) =>
        [...rows.values()].filter((entry) => entry.status === where.status)
      ),
    },
  }

  const storage = {
    create: vi.fn(async () => 42),
    append: vi.fn(async (_oid: number, chunk: Buffer) => chunk.length),
    hash: vi.fn(async () => ({ size: 4, sha256: "hash" })),
    open: vi.fn(),
    upload: vi.fn(),
    unlink: vi.fn(async () => undefined),
  }
  const quota = {
    quotaBytes: vi.fn(async () => 10_000),
    usedBytes: vi.fn(async () => 0),
  }
  const fileService = {
    assertUploadAccess: vi.fn(async () => undefined),
    createUploadedFile: vi.fn(async () => fileNode),
  }
  const deps: UploadSessionDeps = {
    db: db as unknown as UploadSessionDeps["db"],
    storage: storage as unknown as FileStorage,
    quota: quota as unknown as FileQuota,
    fileService: fileService as unknown as UploadSessionDeps["fileService"],
    assertRateLimit: vi.fn(async () => undefined),
    referencedOids: vi.fn(async () => []),
  }
  return {
    row,
    rows,
    db,
    deps,
    storage,
    quota,
    fileService,
    service: new UploadSessionService(deps),
  }
}

describe("UploadSessionService.createUploadSession", () => {
  it("reserves a large object and returns the resumable view", async () => {
    const { deps, storage, service } = build()

    const session = await service.createUploadSession(ctx, {
      name: "plan.pdf",
      parentId: null,
      mimeType: "application/pdf",
      expectedSize: 4,
    })

    expect(deps.assertRateLimit).toHaveBeenCalledWith(
      "uploads:org_1",
      1000,
      60 * 60_000,
      { failOpen: true }
    )
    expect(storage.create).toHaveBeenCalled()
    expect(session).toMatchObject({
      uploadId: "up_new",
      oid: 42,
      receivedBytes: 0,
      expectedSize: 4,
    })
  })

  it("refuses a session that exceeds the remaining quota", async () => {
    const { quota, service, storage } = build()
    quota.quotaBytes = vi.fn(async () => 100)
    quota.usedBytes = vi.fn(async () => 90)

    await expect(
      service.createUploadSession(ctx, {
        name: "plan.pdf",
        parentId: null,
        expectedSize: 20,
      })
    ).rejects.toMatchObject({ code: "storage_quota_exceeded" })

    expect(storage.create).not.toHaveBeenCalled()
  })
})

describe("UploadSessionService.appendUploadChunk", () => {
  it("rejects a chunk that does not start at the received offset", async () => {
    const { service, storage } = build()

    await expect(
      service.appendUploadChunk(ctx, "up_1", 2, Buffer.from("abcd"))
    ).rejects.toMatchObject({ code: "upload_offset_mismatch" })

    expect(storage.append).not.toHaveBeenCalled()
  })

  it("rejects bytes beyond the declared size", async () => {
    const { service } = build()

    await expect(
      service.appendUploadChunk(ctx, "up_1", 0, Buffer.from("abcdef"))
    ).rejects.toMatchObject({ code: "upload_size_mismatch" })
  })

  it("appends in order and tracks the received bytes", async () => {
    const { service, row, storage } = build()
    storage.append.mockResolvedValue(4)

    const result = await service.appendUploadChunk(
      ctx,
      "up_1",
      0,
      Buffer.from("abcd")
    )

    expect(storage.append).toHaveBeenCalledWith(42, Buffer.from("abcd"))
    expect(result).toEqual({ receivedBytes: 4 })
    expect(row.receivedBytes).toBe(4)
  })
})

describe("UploadSessionService.completeUploadSession", () => {
  it("creates the file and marks the session complete", async () => {
    const { service, fileService, row } = build()

    const result = await service.completeUploadSession(ctx, "up_1")

    expect(fileService.createUploadedFile).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ oid: 42, sizeBytes: 4, sha256: "hash" })
    )
    expect(result.file).toEqual(fileNode)
    expect(row.status).toBe("complete")
    expect(row.sha256).toBe("hash")
  })

  it("discards the bytes when the size does not match", async () => {
    const { service, storage, fileService, row } = build()
    storage.hash.mockResolvedValue({ size: 3, sha256: "hash" })

    await expect(
      service.completeUploadSession(ctx, "up_1")
    ).rejects.toMatchObject({ code: "upload_size_mismatch" })

    expect(fileService.createUploadedFile).not.toHaveBeenCalled()
    expect(row.status).toBe("aborted")
    expect(storage.unlink).toHaveBeenCalledWith(42)
  })

  it("returns the large object for a transient attachment", async () => {
    const { service, fileService } = build({ transient: true })

    const result = await service.completeUploadSession(ctx, "up_1")

    expect(fileService.createUploadedFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({ oid: 42, size: 4, file: null })
  })
})

describe("UploadSessionService.abortUploadSession", () => {
  it("marks the session aborted and unlinks its bytes", async () => {
    const { service, storage, row } = build()

    await service.abortUploadSession(ctx, "up_1")

    expect(row.status).toBe("aborted")
    expect(storage.unlink).toHaveBeenCalledWith(42)
  })
})

describe("UploadSessionService.sweepExpiredUploadSessions", () => {
  it("unlinks expired sessions that no file references", async () => {
    const { service, storage, row } = build({
      status: "open",
      expiresAt: new Date(Date.now() - 1_000),
    })

    await service.sweepExpiredUploadSessions()

    expect(storage.unlink).toHaveBeenCalledWith(42)
    expect(row.status).toBe("aborted")
  })

  it("keeps an expired session whose bytes a completed file references", async () => {
    const { service, storage, deps, row } = build({
      status: "open",
      expiresAt: new Date(Date.now() - 1_000),
    })
    deps.referencedOids = vi.fn(async () => ["42"])

    await service.sweepExpiredUploadSessions()

    expect(storage.unlink).not.toHaveBeenCalled()
    expect(row.status).toBe("complete")
  })
})
