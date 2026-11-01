import type { PrismaClient } from "@workspace/db"

/**
 * Only the most recent versions/activity entries are needed by the file
 * panel; unbounded history made the layout payload grow with every edit.
 */
const FILE_INCLUDE = {
  shares: true,
  versions: { orderBy: { at: "desc" as const }, take: 20 },
  activities: { orderBy: { at: "desc" as const }, take: 20 },
}

export class FileRepository {
  constructor(private readonly db: PrismaClient) {}

  list(organizationId: string) {
    return this.db.fileNode.findMany({
      where: { organizationId },
      include: FILE_INCLUDE,
      orderBy: { name: "asc" },
    })
  }

  findById(organizationId: string, id: string) {
    return this.db.fileNode.findFirst({
      where: { id, organizationId },
      include: FILE_INCLUDE,
    })
  }

  async findAncestorChain(organizationId: string, id: string) {
    type ChainNode = {
      id: string
      parentId: string | null
      ownerId: string
      restricted: boolean
      shared: boolean
      shares: { userId: string; permission: string }[]
    }
    const chain: ChainNode[] = []
    const seen = new Set<string>()
    let current: string | null = id
    while (current && !seen.has(current)) {
      seen.add(current)
      const node: ChainNode | null = await this.db.fileNode.findFirst({
        where: { id: current, organizationId },
        select: {
          id: true,
          parentId: true,
          ownerId: true,
          restricted: true,
          shared: true,
          shares: { select: { userId: true, permission: true } },
        },
      })
      if (!node) break
      chain.push(node)
      current = node.parentId
    }
    return chain
  }

  create(data: {
    organizationId: string
    name: string
    kind: string
    parentId: string | null
    ownerId: string
    sizeBytes?: number
    mimeType?: string
    oid?: number
    sha256?: string
    restricted?: boolean
    shared?: boolean
    shares?: { userId: string; permission: string }[]
  }) {
    return this.db.fileNode.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        kind: data.kind,
        parentId: data.parentId,
        ownerId: data.ownerId,
        sizeBytes: data.sizeBytes,
        mimeType: data.mimeType,
        oid: data.oid,
        sha256: data.sha256,
        restricted: data.restricted,
        shared: data.shared,
        shares: data.shares?.length ? { create: data.shares } : undefined,
      },
      include: FILE_INCLUDE,
    })
  }

  createMany(
    data: {
      organizationId: string
      name: string
      kind: string
      parentId: string | null
      ownerId: string
      sizeBytes?: number
      mimeType?: string
      oid?: number
      sha256?: string
    }[]
  ) {
    return this.db.$transaction(
      data.map((item) =>
        this.db.fileNode.create({ data: item })
      )
    )
  }

  update(
    id: string,
    data: {
      name?: string
      parentId?: string | null
      starred?: boolean
      trashed?: boolean
      trashedAt?: Date | null
      shared?: boolean
      restricted?: boolean
      modifiedAt?: Date
      sizeBytes?: number
      mimeType?: string
      oid?: number
      sha256?: string
    }
  ) {
    return this.db.fileNode.update({
      where: { id },
      data,
      include: FILE_INCLUDE,
    })
  }

  updateMany(
    ids: string[],
    data: {
      trashed?: boolean
      trashedAt?: Date | null
    }
  ) {
    return this.db.fileNode.updateMany({
      where: { id: { in: ids } },
      data,
    })
  }

  delete(id: string) {
    return this.db.fileNode.delete({ where: { id } })
  }

  deleteMany(ids: string[]) {
    return this.db.fileNode.deleteMany({ where: { id: { in: ids } } })
  }

  addActivity(fileId: string, userId: string, action: string) {
    return this.db.fileActivity.create({
      data: { fileId, userId, action },
    })
  }

  addVersion(data: {
    fileId: string
    userId: string
    note: string
    oid?: number
    mimeType?: string
    sha256?: string
    sizeBytes?: number
  }) {
    return this.db.fileVersion.create({ data })
  }

  addShare(fileId: string, userId: string, permission: string) {
    return this.db.fileShare.upsert({
      where: { fileId_userId: { fileId, userId } },
      update: { permission },
      create: { fileId, userId, permission },
    })
  }

  removeShare(fileId: string, userId: string) {
    return this.db.fileShare.deleteMany({ where: { fileId, userId } })
  }
}
