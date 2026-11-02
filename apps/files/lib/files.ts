import type { RequestContext } from "@workspace/core/context"
import {
  createFileQuota,
  createFilesRuntime,
  type FileAuditInput,
} from "@workspace/files"

import { recordUserAudit, recordUserAuditMany } from "@/lib/audit"
import { assertRateLimit } from "@/lib/rate-limit"
import { largeObjectStore } from "@/lib/large-object"
import { requireEntitlement, storageQuotaBytes } from "@/lib/entitlements"
import { prisma } from "@/lib/prisma"

/**
 * The files app's binding of `@workspace/files`: the package owns the file
 * rules, this module supplies its own database client, large-object store,
 * audit writer, plan checks and the shared rate limiter.
 */
const quota = createFileQuota({ db: prisma, quotaBytes: storageQuotaBytes })

/**
 * Large objects still referenced by a file or a version in this database.
 * Message attachments are owned by the messages app and accounted for there,
 * so the sweep here never needs another app's table.
 */
async function referencedOids(oids: bigint[]): Promise<string[]> {
  const [files, versions] = await Promise.all([
    prisma.fileNode.findMany({
      where: { oid: { in: oids } },
      select: { oid: true },
    }),
    prisma.fileVersion.findMany({
      where: { oid: { in: oids } },
      select: { oid: true },
    }),
  ])
  return [...files, ...versions]
    .map((row) => row.oid)
    .filter((oid): oid is bigint => oid !== null)
    .map((oid) => oid.toString())
}

export const filesRuntime = createFilesRuntime({
  db: prisma,
  storage: largeObjectStore,
  quota,
  requireEntitlement,
  assertRateLimit,
  referencedOids,
  audit: {
    recordUser: (ctx: RequestContext, input: FileAuditInput) =>
      recordUserAudit(ctx, input),
    recordUserMany: (ctx: RequestContext, inputs: FileAuditInput[]) =>
      recordUserAuditMany(ctx, inputs),
  },
})

export const fileService = filesRuntime.service
export const fileRepository = filesRuntime.repository
export const { quotaBytes: orgQuotaBytes, usedBytes: orgUsedBytes } =
  filesRuntime.quota
export const { listForExport, snapshotForOrganization } = filesRuntime.objects
