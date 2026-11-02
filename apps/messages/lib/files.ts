import {
  UploadSessionService,
  type FileQuota,
  type UploadRateLimit,
  type UploadReferenceChecker,
} from "@workspace/files"

import { storageQuotaBytes } from "@/lib/entitlements"
import { largeObjectStore } from "@/lib/large-object"
import { prisma } from "@/lib/prisma"
import { assertRateLimit } from "@/lib/rate-limit"

/**
 * Attachment uploads for the messages app.
 *
 * Message bytes live in the messages database as PostgreSQL large objects and
 * never enter the files app: an attachment's `oid` would be meaningless in
 * another database. Only the upload-session table (a transient session that
 * returns the oid) is reused from `@workspace/files`.
 */
const quota: FileQuota = {
  quotaBytes: storageQuotaBytes,
  async usedBytes(organizationId) {
    const result = await prisma.messageAttachment.aggregate({
      where: { message: { conversation: { organizationId } } },
      _sum: { sizeBytes: true },
    })
    return result._sum.sizeBytes ?? 0
  },
}

const referencedOids: UploadReferenceChecker = async (oids) => {
  const rows = await prisma.messageAttachment.findMany({
    where: { oid: { in: oids } },
    select: { oid: true },
  })
  return rows
    .map((row) => row.oid)
    .filter((oid): oid is bigint => oid !== null)
    .map((oid) => oid.toString())
}

const uploads = new UploadSessionService({
  db: prisma,
  storage: largeObjectStore,
  quota,
  assertRateLimit: assertRateLimit as UploadRateLimit,
  referencedOids,
})

/** The upload endpoints on this host only accept transient attachments. */
export const filesRuntime = { uploads }
