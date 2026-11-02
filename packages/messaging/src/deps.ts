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
 * The owning app binds its member directory; once the identity reads move
 * behind the internal API (#190/#171) the messages app resolves the same shape
 * from there.
 */
export interface MessagingMember {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: string
}

/**
 * The identity reads the messaging domain needs. Copilot binds the identity
 * database; a domain app binds `IdentityClient` (presence and the DM title).
 */
export interface MessagingDirectory {
  listPresence(
    organizationId: string
  ): Promise<{ userId: string; lastSeenAt: Date | null }[]>
  findName(organizationId: string, userId: string): Promise<string | null>
  touchPresence(userId: string): Promise<void>
}
