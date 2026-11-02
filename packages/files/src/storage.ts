import type { PrismaClient } from "@workspace/db-files"

import type { FileQuota } from "./deps"

export interface FileQuotaOptions {
  /** The files database, for the usage aggregate. */
  db: Pick<PrismaClient, "fileNode">
  /**
   * The organization's byte allowance. The owning app resolves the plan and the
   * per-organization override through Copilot's identity API.
   */
  quotaBytes: (organizationId: string) => Promise<number>
}

/**
 * Quota and usage for the files app.
 *
 * Only bytes in this database count: message attachments live in the messages
 * database and are accounted for by that app.
 */
export function createFileQuota({
  db,
  quotaBytes,
}: FileQuotaOptions): FileQuota {
  async function usedBytes(organizationId: string): Promise<number> {
    const result = await db.fileNode.aggregate({
      where: { organizationId, trashed: false },
      _sum: { sizeBytes: true },
    })
    return result._sum.sizeBytes ?? 0
  }

  return { quotaBytes, usedBytes }
}
