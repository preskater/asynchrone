import type { RequestContext } from "@workspace/core/context"
import {
  createFileQuota,
  createFilesRuntime,
  type FileAuditInput,
} from "@workspace/files"

import { recordUserAudit, recordUserAuditMany } from "@/lib/audit"
import { requireEntitlement, resolvePlan } from "@/lib/entitlements"
import { largeObjectStore } from "@/lib/large-object"
import { prisma } from "@/lib/prisma"
import { assertRateLimit } from "@/lib/rate-limit"

/**
 * The files upload service, bound by the messages app.
 *
 * Attachments are uploaded through the files domain's chunked upload sessions
 * (`transient=1`) and live in PostgreSQL large objects (`@workspace/storage`).
 * Only that path is exposed on this host: message composers call it, and the
 * upload routes here refuse to create workspace file nodes.
 */
const quota = createFileQuota({ db: prisma, resolvePlan })

async function referencedOids(oids: bigint[]): Promise<string[]> {
  const attachments = await prisma.messageAttachment.findMany({
    where: { oid: { in: oids } },
    select: { oid: true },
  })
  return attachments
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
