import type { MessagingStorage } from "./deps"
import type { MessagingDb } from "./repository"

/** A message attachment row that references bytes in a large object. */
export interface OrganizationMessageAttachment {
  id: string
  name: string
  oid: bigint
}

/**
 * A point-in-time list of every large object the organization's message
 * attachments own, plus the deferred unlink. Organization deletion must list
 * before the rows cascade and unlink after the delete commits, so a failed
 * delete never loses bytes.
 */
export interface OrganizationMessagingSnapshot {
  oids: number[]
  unlink: () => Promise<void>
}

export interface MessagingObjects {
  /** The attachments the data export archive includes. */
  listAttachmentsForExport(
    organizationId: string
  ): Promise<OrganizationMessageAttachment[]>
  snapshotForOrganization(
    organizationId: string
  ): Promise<OrganizationMessagingSnapshot>
}

/**
 * Read and unlink the attachment bytes an organization owns.
 *
 * Every caller passes its own client and large-object store, so this package
 * never opens a database or a second pool.
 */
export function createMessagingObjects(
  db: MessagingDb,
  storage: MessagingStorage
): MessagingObjects {
  async function listAttachmentsForExport(
    organizationId: string
  ): Promise<OrganizationMessageAttachment[]> {
    const rows = await db.messageAttachment.findMany({
      where: {
        message: { conversation: { organizationId } },
        oid: { not: null },
      },
      select: { id: true, name: true, oid: true },
      orderBy: { id: "asc" },
    })
    return rows.map((row) => ({ id: row.id, name: row.name, oid: row.oid! }))
  }

  async function snapshotForOrganization(
    organizationId: string
  ): Promise<OrganizationMessagingSnapshot> {
    const rows = await db.messageAttachment.findMany({
      where: {
        message: { conversation: { organizationId } },
        oid: { not: null },
      },
      select: { oid: true },
    })
    const oids = [...new Set(rows.map(({ oid }) => Number(oid)))]

    async function unlink(): Promise<void> {
      // ponytail: an unlink that fails leaves an orphan large object; the
      // verify:organization-deletion script reports them. Add a sweep if it
      // happens.
      for (const oid of oids) {
        await storage.unlink(oid).catch((error: unknown) => {
          console.error(`[messaging] organization unlink ${oid} failed`, error)
        })
      }
    }

    return { oids, unlink }
  }

  return { listAttachmentsForExport, snapshotForOrganization }
}
