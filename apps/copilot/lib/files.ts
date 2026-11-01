import type { RequestContext } from "@workspace/core/context"
import {
  createFileQuota,
  createFilesRuntime,
  type FileAuditInput,
} from "@workspace/files"
import { recordUserAudit, recordUserAuditMany } from "@/lib/audit/record"
import { assertRateLimit } from "@/lib/core/rate-limit"
import { largeObjectStore } from "@/lib/large-object"
import {
  requireEntitlement,
  resolvePlan,
} from "@/lib/organization/entitlements"
import { prisma } from "@/lib/prisma"

/**
 * Copilot's binding of `@workspace/files`: the package owns the file rules,
 * this module supplies the identity database, the large-object store, the
 * audit writer, the plan checks and the shared rate limiter.
 */
const quota = createFileQuota({ db: prisma, resolvePlan })

async function referencedOids(oids: bigint[]): Promise<string[]> {
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
  return [...files, ...versions, ...attachments]
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
