import { describe, expect, it } from "vitest"

import {
  PrismaOidcSessionStore,
  type OidcSessionCreateData,
  type OidcSessionRow,
} from "./prisma-store"
import type { OidcSessionRecord } from "./session"

/** Minimal in-memory stand-in for a Prisma `oidcSession` delegate. */
function fakeDelegate() {
  const rows = new Map<string, OidcSessionRow>()
  return {
    rows,
    create: async ({ data }: { data: OidcSessionCreateData }) => {
      rows.set(data.id, { ...data })
      return data
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      rows.get(where.id) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string }
      data: Partial<OidcSessionRow>
    }) => {
      const current = rows.get(where.id)
      if (!current) throw new Error("missing row")
      rows.set(where.id, { ...current, ...data })
      return current
    },
    delete: async ({ where }: { where: { id: string } }) => {
      rows.delete(where.id)
    },
    deleteMany: async ({ where }: { where: { sid: string } }) => {
      let count = 0
      for (const [id, row] of rows) {
        if (row.sid === where.sid) {
          rows.delete(id)
          count += 1
        }
      }
      return { count }
    },
  }
}

function record(overrides: Partial<OidcSessionRecord> = {}): OidcSessionRecord {
  const now = Date.UTC(2026, 0, 2, 3, 4, 5)
  return {
    id: "session_1",
    userId: "user_1",
    organizationId: "org_1",
    sid: "copilot_session_1",
    accessToken: "access",
    refreshToken: "refresh",
    accessTokenExpiresAt: now + 60_000,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("PrismaOidcSessionStore", () => {
  it("round-trips a session, converting DateTime columns to milliseconds", async () => {
    const delegate = fakeDelegate()
    const store = new PrismaOidcSessionStore(delegate)

    await store.create(record())
    const stored = delegate.rows.get("session_1")

    expect(stored?.accessTokenExpiresAt).toBeInstanceOf(Date)
    expect(await store.get("session_1")).toEqual(record())
  })

  it("returns null for an unknown session", async () => {
    const store = new PrismaOidcSessionStore(fakeDelegate())
    expect(await store.get("missing")).toBeNull()
  })

  it("patches only the token fields", async () => {
    const delegate = fakeDelegate()
    const store = new PrismaOidcSessionStore(delegate)
    await store.create(record())

    await store.update("session_1", {
      accessToken: "access_2",
      accessTokenExpiresAt: Date.UTC(2026, 0, 2, 4),
      updatedAt: Date.UTC(2026, 0, 2, 3, 30),
    })

    const updated = await store.get("session_1")
    expect(updated).toMatchObject({
      id: "session_1",
      userId: "user_1",
      accessToken: "access_2",
      accessTokenExpiresAt: Date.UTC(2026, 0, 2, 4),
    })
    expect(updated?.refreshToken).toBe("refresh")
  })

  it("deletes every session bound to one Copilot session id", async () => {
    const delegate = fakeDelegate()
    const store = new PrismaOidcSessionStore(delegate)
    await store.create(record({ id: "a", sid: "sid_1" }))
    await store.create(record({ id: "b", sid: "sid_1" }))
    await store.create(record({ id: "c", sid: "sid_2" }))

    await store.deleteBySid("sid_1")

    expect(await store.get("a")).toBeNull()
    expect(await store.get("b")).toBeNull()
    expect(await store.get("c")).not.toBeNull()
  })

  it("deletes one session", async () => {
    const delegate = fakeDelegate()
    const store = new PrismaOidcSessionStore(delegate)
    await store.create(record())

    await store.delete("session_1")

    expect(delegate.rows.size).toBe(0)
  })
})
