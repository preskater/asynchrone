import type { Readable } from "node:stream"

/**
 * The bytes a message attachment references.
 *
 * Attachments are uploaded through the files app's chunked upload sessions
 * (`@workspace/files/upload-client`) and stored as PostgreSQL large objects by
 * `@workspace/storage`. The owning app binds the store it already owns; this
 * package never opens a pool.
 */
export interface MessagingStorage {
  open(oid: number): Promise<{ size: number; stream: Readable }>
  unlink(oid: number): Promise<void>
}

/**
 * A member of the organization as the messaging screens render it.
 *
 * Today the owning app binds its member directory; once the messages app runs
 * on its own it resolves the same shape from the identity internal API.
 */
export interface MessagingMember {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: string
}
