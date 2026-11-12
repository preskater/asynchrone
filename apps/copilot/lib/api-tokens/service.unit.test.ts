import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RequestContext } from "@workspace/core/context"
import { ForbiddenError } from "@workspace/core/errors"
import { can } from "@workspace/core/roles"

const db = vi.hoisted(() => ({
  apiToken: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  member: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}))
const audit = vi.hoisted(() => vi.fn())
const entitlement = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/audit/record", () => ({ recordUserAudit: audit }))
vi.mock("@/lib/organization/entitlements", () => ({
  requireEntitlement: entitlement,
}))
vi.mock("@/lib/core/auth-context", () => ({
  requirePermission: (ctx: RequestContext, capability: never) => {
    if (!can(ctx, capability)) throw new ForbiddenError()
  },
}))

import {
  createApiToken,
  listApiTokens,
  requireScope,
  revokeApiToken,
  verifyApiToken,
} from "./service"
import { generateApiToken } from "./token"

const now = new Date("2026-11-12T10:00:00Z")
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000)

function ctx(roles: RequestContext["roles"], userId = "user_1") {
  return {
    userId,
    userName: "Ada",
    userEmail: "ada@example.com",
    organizationId: "org_1",
    roles,
  } satisfies RequestContext
}

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db))
  db.apiToken.create.mockImplementation(({ data }) => ({
    id: "tok_1",
    ...data,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: now,
    user: { id: data.userId, name: "Ada", email: "ada@example.com" },
  }))
})

describe("listApiTokens", () => {
  it("shows a member only their own tokens", async () => {
    db.apiToken.findMany.mockResolvedValue([])
    await listApiTokens(ctx(["member"]))
    expect(db.apiToken.findMany.mock.calls[0]![0].where).toEqual({
      organizationId: "org_1",
      userId: "user_1",
    })
  })

  it("shows an admin every token of the organization", async () => {
    db.apiToken.findMany.mockResolvedValue([])
    await listApiTokens(ctx(["admin"]))
    expect(db.apiToken.findMany.mock.calls[0]![0].where).toEqual({
      organizationId: "org_1",
    })
  })
})

describe("createApiToken", () => {
  const input = {
    name: "CI",
    scopes: ["tasks:write" as const],
    expiresAt: inDays(90),
  }

  it("stores the hash, returns the plaintext once and audits", async () => {
    const { token, apiToken } = await createApiToken(
      ctx(["member"]),
      input,
      now
    )
    const data = db.apiToken.create.mock.calls[0]![0].data
    expect(token.startsWith(`${data.prefix}_`)).toBe(true)
    expect(JSON.stringify(data)).not.toContain(token)
    expect(apiToken).not.toHaveProperty("tokenHash")
    expect(entitlement).toHaveBeenCalledWith("org_1", "apiAccess")
    expect(audit.mock.calls[0]![1]).toMatchObject({
      action: "api_token.created",
      entityType: "apiToken",
    })
  })

  it.each([0, 0.5, 367])("refuses an expiry %d days away", async (days) => {
    await expect(
      createApiToken(
        ctx(["member"]),
        { ...input, expiresAt: inDays(days) },
        now
      )
    ).rejects.toMatchObject({ code: "validation_error" })
    expect(db.apiToken.create).not.toHaveBeenCalled()
  })

  it("accepts the 365-day preset", async () => {
    await createApiToken(
      ctx(["member"]),
      { ...input, expiresAt: inDays(365) },
      now
    )
    expect(db.apiToken.create).toHaveBeenCalled()
  })

  it("refuses a plan without API access", async () => {
    entitlement.mockRejectedValueOnce(
      new ForbiddenError("plan", { code: "upgrade_required" })
    )
    await expect(
      createApiToken(ctx(["member"]), input, now)
    ).rejects.toMatchObject({ code: "upgrade_required" })
  })
})

describe("revokeApiToken", () => {
  it("cannot reach another member's token", async () => {
    db.apiToken.findFirst.mockResolvedValue(null)
    await expect(
      revokeApiToken(ctx(["member"]), "tok_other", now)
    ).rejects.toMatchObject({ code: "not_found" })
    expect(db.apiToken.findFirst.mock.calls[0]![0].where).toMatchObject({
      userId: "user_1",
      organizationId: "org_1",
    })
  })

  it("lets an admin revoke any token, once", async () => {
    db.apiToken.findFirst.mockResolvedValue({
      id: "tok_2",
      name: "CI",
      prefix: "asy_abcdefgh",
      revokedAt: null,
    })
    await revokeApiToken(ctx(["admin"]), "tok_2", now)
    expect(db.apiToken.findFirst.mock.calls[0]![0].where).not.toHaveProperty(
      "userId"
    )
    expect(db.apiToken.update).toHaveBeenCalledWith({
      where: { id: "tok_2" },
      data: { revokedAt: now },
    })
    expect(audit.mock.calls[0]![1].action).toBe("api_token.revoked")

    db.apiToken.findFirst.mockResolvedValue({
      id: "tok_2",
      name: "CI",
      prefix: "asy_abcdefgh",
      revokedAt: now,
    })
    await revokeApiToken(ctx(["admin"]), "tok_2", now)
    expect(db.apiToken.update).toHaveBeenCalledTimes(1)
  })
})

describe("verifyApiToken", () => {
  const { token, prefix, tokenHash } = generateApiToken()
  const row = {
    id: "tok_1",
    organizationId: "org_1",
    tokenHash,
    scopes: ["tasks:read"],
    expiresAt: inDays(10),
    lastUsedAt: null as Date | null,
    revokedAt: null as Date | null,
    user: {
      id: "user_1",
      name: "Ada",
      email: "ada@example.com",
      banned: false,
    },
  }

  beforeEach(() => {
    db.apiToken.findUnique.mockResolvedValue(row)
    db.member.findFirst.mockResolvedValue({
      role: "member,developer",
      clientId: null,
    })
  })

  it("resolves the owner's current roles", async () => {
    const verified = await verifyApiToken(token, now)
    expect(db.apiToken.findUnique.mock.calls[0]![0].where).toEqual({ prefix })
    expect(verified.ctx).toMatchObject({
      userId: "user_1",
      organizationId: "org_1",
      roles: ["member", "developer"],
    })
    expect(db.apiToken.update).toHaveBeenCalledWith({
      where: { id: "tok_1" },
      data: { lastUsedAt: now },
    })
  })

  it("skips the lastUsedAt write within a minute", async () => {
    db.apiToken.findUnique.mockResolvedValue({
      ...row,
      lastUsedAt: new Date(now.getTime() - 30_000),
    })
    await verifyApiToken(token, now)
    expect(db.apiToken.update).not.toHaveBeenCalled()
  })

  it.each([
    ["missing", null],
    ["malformed", "nope"],
    ["wrong secret", `${prefix}_${"a".repeat(43)}`],
  ])("rejects a %s token as invalid", async (_label, value) => {
    await expect(verifyApiToken(value, now)).rejects.toMatchObject({
      code: "token_invalid",
      status: 401,
    })
  })

  it("rejects a revoked token", async () => {
    db.apiToken.findUnique.mockResolvedValue({ ...row, revokedAt: now })
    await expect(verifyApiToken(token, now)).rejects.toMatchObject({
      code: "token_revoked",
    })
  })

  it("rejects an expired token", async () => {
    db.apiToken.findUnique.mockResolvedValue({ ...row, expiresAt: now })
    await expect(verifyApiToken(token, now)).rejects.toMatchObject({
      code: "token_expired",
    })
  })

  it.each([
    ["left the organization", null],
    ["became a portal account", { role: "client", clientId: "client_1" }],
  ])("rejects a token whose owner %s", async (_label, member) => {
    db.member.findFirst.mockResolvedValue(member)
    await expect(verifyApiToken(token, now)).rejects.toMatchObject({
      code: "token_revoked",
    })
  })

  it("rejects a banned owner", async () => {
    db.apiToken.findUnique.mockResolvedValue({
      ...row,
      user: { ...row.user, banned: true },
    })
    await expect(verifyApiToken(token, now)).rejects.toMatchObject({
      code: "token_revoked",
    })
  })
})

describe("requireScope", () => {
  it("refuses a missing scope even for an owner", () => {
    const verified = {
      ctx: ctx(["owner"]),
      tokenId: "tok_1",
      prefix: "asy_abcdefgh",
      scopes: ["tasks:read" as const],
    }
    expect(() => requireScope(verified, "tasks:read")).not.toThrow()
    expect(() => requireScope(verified, "tasks:write")).toThrow(
      expect.objectContaining({ code: "token_scope_missing", status: 403 })
    )
  })
})
