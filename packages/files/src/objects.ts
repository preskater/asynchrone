import type { PrismaClient } from "@workspace/db-files"

import type { FileStorage } from "./deps"

/** A file or version row that references bytes in a large object. */
export interface OrganizationFileObject {
  id: string
  name: string
  oid: bigint
}

export interface OrganizationFileVersionObject extends OrganizationFileObject {
  fileId: string
}

/**
 * The bytes an organization's files and versions reference, for the data
 * export archive. Unfinished upload sessions are deliberately excluded: their
 * bytes are not part of the exported data.
 */
export interface OrganizationFileObjects {
  files: OrganizationFileObject[]
  versions: OrganizationFileVersionObject[]
}

/**
 * A point-in-time list of every large object the organization owns, plus the
 * deferred unlink. Organization deletion must list before the rows cascade and
 * unlink after the delete commits, so a failed delete never loses bytes.
 */
export interface OrganizationFileSnapshot {
  oids: number[]
  unlink: () => Promise<void>
}

export interface FileObjects {
  listForExport(organizationId: string): Promise<OrganizationFileObjects>
  snapshotForOrganization(
    organizationId: string
  ): Promise<OrganizationFileSnapshot>
}

/**
 * Read and unlink the file bytes an organization owns.
 *
 * Every caller passes its own client and large-object store, so this package
 * never opens a database or a second pool.
 */
export function createFileObjects(
  db: PrismaClient,
  storage: FileStorage
): FileObjects {
  async function listForExport(
    organizationId: string
  ): Promise<OrganizationFileObjects> {
    const [files, versions] = await Promise.all([
      db.fileNode.findMany({
        where: { organizationId, oid: { not: null } },
        select: { id: true, name: true, oid: true },
      }),
      db.fileVersion.findMany({
        where: { file: { organizationId }, oid: { not: null } },
        select: {
          id: true,
          fileId: true,
          oid: true,
          file: { select: { name: true } },
        },
      }),
    ])
    return {
      files: files.map((file) => ({
        id: file.id,
        name: file.name,
        oid: file.oid!,
      })),
      versions: versions.map((version) => ({
        id: version.id,
        fileId: version.fileId,
        name: version.file.name,
        oid: version.oid!,
      })),
    }
  }

  async function snapshotForOrganization(
    organizationId: string
  ): Promise<OrganizationFileSnapshot> {
    const [files, versions, uploads] = await Promise.all([
      db.fileNode.findMany({
        where: { organizationId, oid: { not: null } },
        select: { oid: true },
      }),
      db.fileVersion.findMany({
        where: { file: { organizationId }, oid: { not: null } },
        select: { oid: true },
      }),
      db.uploadSession.findMany({
        where: { organizationId },
        select: { oid: true },
      }),
    ])
    const oids = [
      ...new Set(
        [...files, ...versions, ...uploads].map(({ oid }) => Number(oid))
      ),
    ]

    async function unlink(): Promise<void> {
      // ponytail: an unlink that fails leaves an orphan large object; the
      // verify:organization-deletion script reports them. Add a sweep if it
      // happens.
      for (const oid of oids) {
        await storage.unlink(oid).catch((error: unknown) => {
          console.error(`[files] organization unlink ${oid} failed`, error)
        })
      }
    }

    return { oids, unlink }
  }

  return { listForExport, snapshotForOrganization }
}
