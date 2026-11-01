import type {
  OidcSessionPatch,
  OidcSessionRecord,
  OidcSessionStore,
} from "./session"

/**
 * Prisma-backed `OidcSessionStore`.
 *
 * The helper is database-agnostic on purpose: it takes the `oidcSession`
 * delegate of whichever Prisma client the app owns (see `docs/domain-app-template.md`).
 * A domain app binds its own `@workspace/db-<domain>` client, so no app can
 * read another app's sessions.
 *
 * The model must expose these columns (see `packages/db/prisma/schema.prisma`):
 *
 * ```prisma
 * model OidcSession {
 *   id                   String   @id
 *   userId               String
 *   organizationId       String
 *   sid                  String
 *   accessToken          String
 *   refreshToken         String?
 *   accessTokenExpiresAt DateTime
 *   createdAt            DateTime @default(now())
 *   updatedAt            DateTime @updatedAt
 *
 *   @@index([sid])
 * }
 * ```
 */
export interface OidcSessionRow {
  id: string
  userId: string
  organizationId: string
  sid: string
  accessToken: string
  refreshToken: string | null
  accessTokenExpiresAt: Date | number
  createdAt: Date | number
  updatedAt: Date | number
}

export interface OidcSessionCreateData {
  id: string
  userId: string
  organizationId: string
  sid: string
  accessToken: string
  refreshToken: string | null
  accessTokenExpiresAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface OidcSessionUpdateData {
  accessToken?: string
  refreshToken?: string | null
  accessTokenExpiresAt?: Date
  updatedAt?: Date
}

/**
 * The slice of a Prisma client this store needs. Structural so every app can
 * pass its own generated delegate without importing a database package here.
 */
export interface OidcSessionDelegate {
  create(args: { data: OidcSessionCreateData }): PromiseLike<unknown>
  findUnique(args: {
    where: { id: string }
  }): PromiseLike<OidcSessionRow | null>
  update(args: {
    where: { id: string }
    data: OidcSessionUpdateData
  }): PromiseLike<unknown>
  delete(args: { where: { id: string } }): PromiseLike<unknown>
  deleteMany(args: { where: { sid: string } }): PromiseLike<{ count: number }>
}

/** Unix milliseconds from a Prisma `DateTime` or an already-normalized value. */
export function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value
}

function fromRow(row: OidcSessionRow): OidcSessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    sid: row.sid,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    accessTokenExpiresAt: toMillis(row.accessTokenExpiresAt),
    createdAt: toMillis(row.createdAt),
    updatedAt: toMillis(row.updatedAt),
  }
}

function toCreateData(record: OidcSessionRecord): OidcSessionCreateData {
  return {
    id: record.id,
    userId: record.userId,
    organizationId: record.organizationId,
    sid: record.sid,
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    accessTokenExpiresAt: new Date(record.accessTokenExpiresAt),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  }
}

function toUpdateData(patch: OidcSessionPatch): OidcSessionUpdateData {
  return {
    ...(patch.accessToken === undefined
      ? {}
      : { accessToken: patch.accessToken }),
    ...(patch.refreshToken === undefined
      ? {}
      : { refreshToken: patch.refreshToken }),
    ...(patch.accessTokenExpiresAt === undefined
      ? {}
      : {
          accessTokenExpiresAt: new Date(patch.accessTokenExpiresAt),
        }),
    ...(patch.updatedAt === undefined
      ? {}
      : { updatedAt: new Date(patch.updatedAt) }),
  }
}

export class PrismaOidcSessionStore implements OidcSessionStore {
  constructor(private readonly delegate: OidcSessionDelegate) {}

  async create(record: OidcSessionRecord): Promise<void> {
    await this.delegate.create({ data: toCreateData(record) })
  }

  async get(id: string): Promise<OidcSessionRecord | null> {
    const row = await this.delegate.findUnique({ where: { id } })
    return row ? fromRow(row) : null
  }

  async update(id: string, patch: OidcSessionPatch): Promise<void> {
    const data = toUpdateData(patch)
    if (Object.keys(data).length === 0) return
    await this.delegate.update({ where: { id }, data })
  }

  async delete(id: string): Promise<void> {
    await this.delegate.delete({ where: { id } })
  }

  /** Back-channel logout deletes every local session of the Copilot session. */
  async deleteBySid(sid: string): Promise<void> {
    await this.delegate.deleteMany({ where: { sid } })
  }
}
