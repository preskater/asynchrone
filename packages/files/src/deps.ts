import type { Readable } from "node:stream"

import type { RequestContext } from "@workspace/core/context"
import type { Entitlement } from "@workspace/core/plans"

/**
 * An audit row the files domain writes. Copilot binds
 * `recordUserAudit`/`recordUserAuditMany` from `@/lib/audit/record`, which
 * adds the identity and request metadata for the acting user.
 */
export interface FileAuditInput {
  action: string
  entityType: string
  entityId: string
  entityLabel?: string | null
  before?: unknown
  after?: unknown
}

export interface FileAudit {
  recordUser(ctx: RequestContext, input: FileAuditInput): Promise<void>
  recordUserMany(ctx: RequestContext, inputs: FileAuditInput[]): Promise<void>
}

/**
 * Bytes live in PostgreSQL large objects. `@workspace/storage` owns the
 * engine; the owning app binds it to its own pool.
 */
export interface FileStorage {
  create(): Promise<number>
  append(oid: number, chunk: Buffer): Promise<number>
  hash(oid: number): Promise<{ size: number; sha256: string }>
  open(oid: number): Promise<{ size: number; stream: Readable }>
  upload(
    readable: Readable
  ): Promise<{ oid: number; size: number; sha256: string }>
  unlink(oid: number): Promise<void>
}

/** Storage quota and usage for one organization, read from its file rows. */
export interface FileQuota {
  quotaBytes(organizationId: string): Promise<number>
  usedBytes(organizationId: string): Promise<number>
}

/** The plan check the file permission features need. */
export type FileEntitlementCheck = (
  organizationId: string,
  entitlement: Entitlement
) => Promise<void>
