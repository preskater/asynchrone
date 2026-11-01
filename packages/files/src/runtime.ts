import type { PrismaClient } from "@workspace/db"

import type {
  FileAudit,
  FileEntitlementCheck,
  FileQuota,
  FileStorage,
} from "./deps"
import { createFileObjects, type FileObjects } from "./objects"
import { FileRepository } from "./repository"
import { FileService } from "./service"
import {
  UploadSessionService,
  type UploadRateLimit,
  type UploadReferenceChecker,
} from "./upload-session"

export interface FilesRuntimeOptions {
  /** The files app's own database client. */
  db: PrismaClient
  /** The app's audit writer (`recordUserAudit`/`recordUserAuditMany`). */
  audit: FileAudit
  /** Quota and usage reader, bound to the same database. */
  quota: FileQuota
  /** The large-object store bound to the app's own pool. */
  storage: FileStorage
  /** The app's plan check (Copilot binds `requireEntitlement`). */
  requireEntitlement: FileEntitlementCheck
  /** The app's shared rate limiter. */
  assertRateLimit: UploadRateLimit
  /** Which oids a completed file, version or attachment already references. */
  referencedOids: UploadReferenceChecker
}

export interface FilesRuntime {
  repository: FileRepository
  service: FileService
  uploads: UploadSessionService
  objects: FileObjects
  quota: FileQuota
}

/**
 * Bind the files domain to one app's database, large-object store, audit
 * writer, quota reader, plan check and rate limiter.
 *
 * Copilot calls this once from `apps/copilot/lib/files.ts`. When Files becomes
 * `apps/files` it calls the same factory with its own pool and database.
 */
export function createFilesRuntime(options: FilesRuntimeOptions): FilesRuntime {
  const repository = new FileRepository(options.db)
  const service = new FileService(repository, {
    audit: options.audit,
    quota: options.quota,
    storage: options.storage,
    requireEntitlement: options.requireEntitlement,
  })
  const uploads = new UploadSessionService({
    db: options.db,
    storage: options.storage,
    quota: options.quota,
    fileService: service,
    assertRateLimit: options.assertRateLimit,
    referencedOids: options.referencedOids,
  })
  const objects = createFileObjects(options.db, options.storage)

  return {
    repository,
    service,
    uploads,
    objects,
    quota: options.quota,
  }
}
