import type { DeletionResult } from "@workspace/contracts"

import { largeObjectStore } from "@/lib/large-object"
import { prisma } from "@/lib/prisma"

const APP = "files"

async function unlink(oids: (bigint | null)[]) {
  for (const oid of new Set(oids.filter((value): value is bigint => value !== null))) {
    await largeObjectStore.unlink(Number(oid)).catch((error: unknown) => {
      console.error(`[files] unlink ${oid} failed`, error)
    })
  }
}

export async function deleteOrganization(
  organizationId: string
): Promise<DeletionResult> {
  const where = { organizationId }
  const [files, versions, sessions] = await Promise.all([
    prisma.fileNode.findMany({ where, select: { oid: true } }),
    prisma.fileVersion.findMany({ where: { file: where }, select: { oid: true } }),
    prisma.uploadSession.findMany({ where, select: { oid: true } }),
  ])
  const deleted = await prisma.$transaction(async (tx) => {
    const shares = await tx.fileShare.deleteMany({ where: { file: where } })
    const versionRows = await tx.fileVersion.deleteMany({ where: { file: where } })
    const activity = await tx.fileActivity.deleteMany({ where: { file: where } })
    const nodes = await tx.fileNode.deleteMany({ where })
    const uploads = await tx.uploadSession.deleteMany({ where })
    const auditLog = await tx.auditLog.deleteMany({ where })
    return {
      fileShare: shares.count,
      fileVersion: versionRows.count,
      fileActivity: activity.count,
      fileNode: nodes.count,
      uploadSession: uploads.count,
      auditLog: auditLog.count,
    }
  })
  await unlink([
    ...files.map((row) => row.oid),
    ...versions.map((row) => row.oid),
    ...sessions.map((row) => row.oid),
  ])
  return { app: APP, organizationId, deleted, completedAt: new Date() }
}

export async function deleteUser(
  userId: string,
  organizationId = ""
): Promise<DeletionResult> {
  const deleted = await prisma.$transaction(async (tx) => {
    const shares = await tx.fileShare.deleteMany({ where: { userId } })
    const uploads = await tx.uploadSession.deleteMany({ where: { userId } })
    const nodes = await tx.fileNode.updateMany({
      where: { ownerId: userId },
      data: { ownerId: "deleted" },
    })
    return {
      fileShare: shares.count,
      uploadSession: uploads.count,
      fileNode: nodes.count,
    }
  })
  return {
    app: APP,
    organizationId,
    userId,
    deleted,
    completedAt: new Date(),
  }
}
