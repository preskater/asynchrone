import { beforeAll, describe, expect, it } from "vitest"

import { auditChanges, formatAuditValue } from "./changes"
import {
  AUDIT_EXPORT_LIMIT,
  auditDateRange,
  auditWhere,
  parseDayUtc,
} from "./filters"
import {
  AUDIT_RETENTION_DAYS,
  AUDIT_RETENTION_MAX_DAYS,
  AUDIT_RETENTION_MIN_DAYS,
  auditRetentionCutoff,
  normalizeRetentionDays,
  parseRetentionOverride,
  resolveAuditRetention,
} from "./retention"
import { ipFromHeaders, requestMetaFromHeaders } from "./request-meta"
import type { PruneDb } from "./prune"

// `prune` pulls in `lib/prisma`, which validates the environment on import.
let pruneAuditLogs: typeof import("./prune").pruneAuditLogs
beforeAll(async () => {
  process.env.DATABASE_URL = "postgres://localhost:5432/test"
  process.env.BETTER_AUTH_SECRET = "unit-test-secret-at-least-16-chars"
  process.env.BETTER_AUTH_URL = "http://localhost:3000"
  ;({ pruneAuditLogs } = await import("./prune"))
})

describe("audit changes", () => {
  it("only reports the fields that differ", () => {
    expect(
      auditChanges(
        { role: "member", name: "Ada" },
        { role: "admin", name: "Ada" }
      )
    ).toEqual([{ field: "role", before: "member", after: "admin" }])
  })

  it("reports everything an update added or removed", () => {
    expect(auditChanges(null, { trialEndsAt: "2026-11-01" })).toEqual([
      { field: "trialEndsAt", before: null, after: "2026-11-01" },
    ])
    expect(auditChanges({ plan: "team" }, undefined)).toEqual([
      { field: "plan", before: "team", after: null },
    ])
  })

  it("handles bare values and nested snapshots", () => {
    expect(auditChanges("a", "b")).toEqual([
      { field: "value", before: "a", after: "b" },
    ])
    expect(auditChanges({ a: 1 }, { a: 1 })).toEqual([])
    expect(formatAuditValue(["a", "b"])).toBe("a, b")
    expect(formatAuditValue({ a: 1 })).toBe('{"a":1}')
  })

  it("truncates very long values", () => {
    const formatted = formatAuditValue("x".repeat(500))
    expect(formatted).toHaveLength(200)
    expect(formatted?.endsWith("…")).toBe(true)
  })
})

describe("audit filters", () => {
  it("parses calendar days in UTC and rejects impossible ones", () => {
    expect(parseDayUtc("2026-10-31")?.toISOString()).toBe(
      "2026-10-31T00:00:00.000Z"
    )
    expect(parseDayUtc("2026-02-30")).toBeNull()
    expect(parseDayUtc("31/10/2026")).toBeNull()
    expect(parseDayUtc(undefined)).toBeNull()
  })

  it("covers the whole upper day", () => {
    const range = auditDateRange({ from: "2026-10-01", to: "2026-10-02" })
    expect(range?.gte?.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(range?.lt?.toISOString()).toBe("2026-10-03T00:00:00.000Z")
  })

  it("builds a scoped where clause and ignores empty filters", () => {
    expect(auditWhere("org_1", {})).toEqual({ organizationId: "org_1" })
    expect(
      auditWhere("org_1", {
        actorId: "user_1",
        action: "task.deleted",
        entityType: "task",
        from: "2026-10-01",
      })
    ).toEqual({
      organizationId: "org_1",
      actorId: "user_1",
      action: "task.deleted",
      entityType: "task",
      createdAt: { gte: new Date("2026-10-01T00:00:00.000Z") },
    })
  })

  it("caps one export", () => {
    expect(AUDIT_EXPORT_LIMIT).toBe(5000)
  })
})

describe("audit retention", () => {
  const now = new Date("2026-10-31T12:00:00.000Z")

  it("uses the plan default", () => {
    expect(AUDIT_RETENTION_DAYS).toEqual({
      free: 30,
      team: 365,
      enterprise: 730,
    })
    expect(
      resolveAuditRetention(
        { metadata: null, trialEndsAt: null, subscription: null },
        now
      )
    ).toMatchObject({ plan: "free", days: 30, canConfigure: false })
    expect(
      resolveAuditRetention(
        {
          metadata: null,
          trialEndsAt: null,
          subscription: { plan: "team" },
        },
        now
      )
    ).toMatchObject({ plan: "team", days: 365, overrideDays: null })
  })

  it("treats an open trial as Team, and a subscription as winning over it", () => {
    expect(
      resolveAuditRetention(
        {
          metadata: JSON.stringify({ plan: "free" }),
          trialEndsAt: new Date("2026-11-10T00:00:00.000Z"),
          subscription: null,
        },
        now
      )
    ).toMatchObject({ plan: "team", days: 365 })
    expect(
      resolveAuditRetention(
        {
          metadata: JSON.stringify({ plan: "team" }),
          trialEndsAt: new Date("2026-11-10T00:00:00.000Z"),
          subscription: { plan: "enterprise" },
        },
        now
      )
    ).toMatchObject({ plan: "enterprise", days: 730 })
  })

  it("only honours the override on Enterprise, clamped to the floors", () => {
    const enterprise = {
      metadata: JSON.stringify({ plan: "enterprise", auditRetentionDays: 400 }),
      trialEndsAt: null,
      subscription: null,
    }
    expect(resolveAuditRetention(enterprise, now)).toMatchObject({
      plan: "enterprise",
      days: 400,
      overrideDays: 400,
      canConfigure: true,
    })
    expect(
      resolveAuditRetention(
        {
          ...enterprise,
          metadata: JSON.stringify({
            plan: "enterprise",
            auditRetentionDays: 3,
          }),
        },
        now
      )
    ).toMatchObject({ days: AUDIT_RETENTION_MIN_DAYS })

    const team = {
      metadata: JSON.stringify({ plan: "team", auditRetentionDays: 400 }),
      trialEndsAt: null,
      subscription: null,
    }
    expect(resolveAuditRetention(team, now)).toMatchObject({
      plan: "team",
      days: 365,
      overrideDays: null,
      canConfigure: false,
    })
  })

  it("normalizes and parses override values", () => {
    expect(normalizeRetentionDays(90)).toBe(90)
    expect(normalizeRetentionDays("90")).toBe(90)
    expect(normalizeRetentionDays(1)).toBe(AUDIT_RETENTION_MIN_DAYS)
    expect(normalizeRetentionDays(1e9)).toBe(AUDIT_RETENTION_MAX_DAYS)
    expect(normalizeRetentionDays("soon")).toBeNull()
    expect(normalizeRetentionDays(null)).toBeNull()
    expect(parseRetentionOverride("{not json")).toBeNull()
    expect(
      parseRetentionOverride(JSON.stringify({ auditRetentionDays: 120 }))
    ).toBe(120)
  })

  it("derives the cutoff from the window", () => {
    expect(auditRetentionCutoff(30, now).toISOString()).toBe(
      "2026-10-01T12:00:00.000Z"
    )
  })
})

describe("audit request metadata", () => {
  it("reads only trusted headers, first one wins", () => {
    const source = new Headers({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1, 10.0.0.1",
      "user-agent": "Mozilla/5.0",
    })
    expect(ipFromHeaders(source, ["x-real-ip", "x-forwarded-for"])).toBe(
      "203.0.113.7"
    )
    expect(ipFromHeaders(source, ["x-forwarded-for"])).toBe("198.51.100.1")
    expect(ipFromHeaders(source, ["x-client-ip"])).toBeNull()
    expect(requestMetaFromHeaders(source, ["x-real-ip"])).toEqual({
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
    })
  })

  it("returns nulls when the headers are missing", () => {
    expect(requestMetaFromHeaders(new Headers(), ["x-real-ip"])).toEqual({
      ipAddress: null,
      userAgent: null,
    })
  })
})

describe("audit pruning", () => {
  const now = new Date("2026-10-31T12:00:00.000Z")

  function fakeDb(rowsByOrganization: Record<string, { id: string }[]>) {
    const deleted: string[] = []
    const closed: unknown[] = []
    const organizations = Object.keys(rowsByOrganization).map((id) => ({
      id,
      metadata: null,
      trialEndsAt: null,
      subscription: null,
    }))
    const db = {
      organization: {
        findMany: async () => organizations,
      },
      auditLog: {
        findMany: async (args: { where: { organizationId: string } }) => {
          closed.push(args.where)
          return (rowsByOrganization[args.where.organizationId] ?? []).slice(
            0,
            2
          )
        },
        deleteMany: async (args: { where: { id: { in: string[] } } }) => {
          const ids = args.where.id.in
          deleted.push(...ids)
          for (const key of Object.keys(rowsByOrganization)) {
            rowsByOrganization[key] = (rowsByOrganization[key] ?? []).filter(
              (row) => !ids.includes(row.id)
            )
          }
          return { count: ids.length }
        },
        count: async (args: { where: { organizationId: string } }) =>
          (rowsByOrganization[args.where.organizationId] ?? []).length,
      },
    }
    return { db: db as unknown as PruneDb, deleted, closed }
  }

  it("prunes past the retention window and stops when empty", async () => {
    const { db, deleted, closed } = fakeDb({
      org_1: [{ id: "a" }, { id: "b" }, { id: "c" }],
      org_2: [],
    })

    const result = await pruneAuditLogs({ db, now, batchSize: 2 })

    expect(deleted).toEqual(["a", "b", "c"])
    expect(result).toEqual({ organizations: 2, deleted: 3, capped: 0 })
    // Only rows older than the plan window are selected.
    expect(closed[0]).toMatchObject({
      createdAt: { lt: new Date("2026-10-01T12:00:00.000Z") },
    })
  })

  it("leaves a backlog for the next run instead of locking the table", async () => {
    const { db, deleted } = fakeDb({
      org_1: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }],
    })

    const result = await pruneAuditLogs({
      db,
      now,
      batchSize: 2,
      maxBatchesPerOrganization: 2,
    })

    expect(deleted).toEqual(["a", "b", "c", "d"])
    expect(result.capped).toBe(1)
  })
})
