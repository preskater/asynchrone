import { PassThrough } from "node:stream"

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import type { FileRepository } from "./repository"
import { FileService, type FileServiceDeps } from "./service"

const ctx: RequestContext = {
  userId: "user_1",
  userName: "Ada",
  userEmail: "ada@example.com",
  organizationId: "org_1",
  role: "owner",
}

const sourceRow = {
  id: "file_1",
  organizationId: "org_1",
  name: "plan.pdf",
  kind: "document",
  parentId: null,
  ownerId: "user_1",
  modifiedAt: new Date("2026-10-22T00:00:00Z"),
  sizeBytes: 1024,
  starred: false,
  trashed: false,
  trashedAt: null,
  shared: true,
  restricted: true,
  mimeType: "application/pdf",
  oid: 42n,
  sha256: "source-hash",
  createdAt: new Date("2026-10-22T00:00:00Z"),
  shares: [{ userId: "user_2", permission: "view" }],
  versions: [],
  activities: [],
}

function buildService() {
  const repo = {
    findById: vi.fn(async () => sourceRow),
    findAncestorChain: vi.fn(async () => []),
    create: vi.fn(async () => ({
      ...sourceRow,
      id: "file_2",
      name: "plan (copy).pdf",
      oid: 7n,
      sha256: "copy-hash",
    })),
    addActivity: vi.fn(async () => undefined),
    addVersion: vi.fn(async () => undefined),
    addShare: vi.fn(async () => undefined),
    removeShare: vi.fn(async () => ({ count: 1 })),
    update: vi.fn(async () => sourceRow),
  }
  const stream = new PassThrough()
  vi.spyOn(stream, "destroy")
  const deps: FileServiceDeps = {
    audit: { recordUser: vi.fn(), recordUserMany: vi.fn() },
    quota: {
      quotaBytes: vi.fn(async () => 10_000),
      usedBytes: vi.fn(async () => 0),
    },
    storage: {
      create: vi.fn(),
      append: vi.fn(),
      hash: vi.fn(),
      open: vi.fn(async () => ({ size: 1024, stream })),
      upload: vi.fn(async () => ({
        oid: 7,
        size: 1024,
        sha256: "copy-hash",
      })),
      unlink: vi.fn(async () => undefined),
    },
    requireEntitlement: vi.fn(async () => undefined),
  }
  return {
    repo,
    deps,
    stream,
    service: new FileService(repo as unknown as FileRepository, deps),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("FileService.duplicateFile", () => {
  it("streams the bytes into a new large object", async () => {
    const { repo, deps, service } = buildService()

    const copy = await service.duplicateFile(ctx, "file_1")

    expect(deps.storage.open).toHaveBeenCalledWith(42)
    expect(deps.storage.upload).toHaveBeenCalledTimes(1)
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "plan (copy).pdf",
        oid: 7,
        sha256: "copy-hash",
        sizeBytes: 1024,
        mimeType: "application/pdf",
      })
    )
    expect(copy.id).toBe("file_2")
    expect(copy.hasStorage).toBe(true)
  })

  it("keeps the source's visibility on the copy", async () => {
    const { repo, service } = buildService()

    await service.duplicateFile(ctx, "file_1")

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        restricted: true,
        shared: true,
        shares: [{ userId: "user_2", permission: "view" }],
      })
    )
  })

  it("refuses to duplicate when the copy would exceed the quota", async () => {
    const { repo, deps, stream, service } = buildService()
    deps.quota.quotaBytes = vi.fn(async () => 1_000)
    deps.quota.usedBytes = vi.fn(async () => 500)

    await expect(service.duplicateFile(ctx, "file_1")).rejects.toMatchObject({
      code: "storage_quota_exceeded",
    })

    expect(deps.storage.upload).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
    // The still-open source stream must release its pooled connection.
    expect(stream.destroy).toHaveBeenCalled()
  })

  it("unlinks the fresh copy when the row insert fails", async () => {
    const { repo, deps, service } = buildService()
    repo.create.mockRejectedValue(new Error("boom"))

    await expect(service.duplicateFile(ctx, "file_1")).rejects.toThrow("boom")

    expect(deps.storage.unlink).toHaveBeenCalledWith(7)
  })
})

describe("FileService shares", () => {
  it("adds a share and audits it", async () => {
    const { repo, deps, service } = buildService()
    repo.findById.mockResolvedValue({
      ...sourceRow,
      shares: [
        { userId: "user_2", permission: "view" },
        { userId: "user_3", permission: "edit" },
      ],
    })

    const shares = await service.addShare(ctx, "file_1", {
      memberId: "user_3",
      permission: "edit",
    })

    expect(deps.requireEntitlement).toHaveBeenCalledWith(
      "org_1",
      "granularPermissions"
    )
    expect(repo.addShare).toHaveBeenCalledWith("file_1", "user_3", "edit")
    expect(repo.update).toHaveBeenCalledWith("file_1", { shared: true })
    expect(deps.audit.recordUser).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        action: "file.share.added",
        entityId: "file_1",
        after: { memberId: "user_3", permission: "edit" },
      })
    )
    expect(shares).toEqual([
      { memberId: "user_2", permission: "view" },
      { memberId: "user_3", permission: "edit" },
    ])
  })

  it("removes a share without requiring the entitlement", async () => {
    const { repo, deps, service } = buildService()
    repo.findById.mockResolvedValue({ ...sourceRow, shares: [] })

    const shares = await service.removeShare(ctx, "file_1", {
      memberId: "user_2",
    })

    expect(repo.removeShare).toHaveBeenCalledWith("file_1", "user_2")
    expect(deps.requireEntitlement).not.toHaveBeenCalled()
    expect(deps.audit.recordUser).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ action: "file.share.removed" })
    )
    expect(shares).toEqual([])
  })
})

describe("FileService versions", () => {
  it("records the initial upload as the first version", async () => {
    const { repo, deps, service } = buildService()
    repo.create.mockResolvedValue(sourceRow)

    await service.createUploadedFile(ctx, {
      name: "plan.pdf",
      parentId: null,
      sizeBytes: 1024,
      mimeType: "application/pdf",
      oid: 42,
      sha256: "source-hash",
    })

    expect(repo.addVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_1",
        note: "Initial upload",
        oid: 42,
        sha256: "source-hash",
      })
    )
    expect(repo.addActivity).toHaveBeenCalledWith(
      "file_1",
      "user_1",
      "uploadedThisFile"
    )
    expect(deps.audit.recordUser).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ action: "file.created", entityId: "file_1" })
    )
  })
})
