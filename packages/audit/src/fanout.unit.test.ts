import type { AuditFilter, AuditPageInput } from "./filters"
import { decodeAuditCursor } from "./reader"
import type { AuditEntryView, AuditFacets } from "./types"
import type { AuditClient } from "@workspace/contracts"
import { describe, expect, it, vi } from "vitest"

import {
  exportAuditAcrossApps,
  facetsAcrossApps,
  listAuditAcrossApps,
  type LocalAuditSource,
  type RemoteAuditSource,
} from "./fanout"

function entry(id: string, createdAt: string, action = "project.created") {
  return {
    id,
    createdAt,
    actorId: "user_1",
    actorName: "Ada",
    actorEmail: "ada@example.com",
    action,
    entityType: "project",
    entityId: id,
    entityLabel: null,
    ipAddress: null,
    userAgent: null,
    before: null,
    after: null,
  } satisfies AuditEntryView
}

function localSource(rows: AuditEntryView[]): LocalAuditSource {
  return {
    list: async (_organizationId: string, input: AuditPageInput) => {
      const cursor = decodeAuditCursor(input.cursor)
      const index = cursor
        ? rows.findIndex((row) => row.id === cursor.id) + 1
        : 0
      const limit = input.limit ?? 50
      const end = index + limit
      const items = rows.slice(index, end)
      return {
        items,
        nextCursor:
          end < rows.length && items.length
            ? items[items.length - 1]!.id
            : null,
        total: rows.length,
      }
    },
    facets: async () =>
      ({
        actions: [{ value: "project.created", count: 2 }],
        entityTypes: [{ value: "project", count: 2 }],
        actors: [{ id: "user_1", name: "Ada" }],
      }) satisfies AuditFacets,
    export: async (
      _organizationId: string,
      _filter: AuditFilter,
      limit: number
    ) => ({
      entries: rows.slice(0, limit),
      truncated: rows.length > limit,
    }),
  }
}

function remote(app: string, client: Partial<AuditClient>): RemoteAuditSource {
  return { app, client: client as AuditClient }
}

describe("audit fan-out", () => {
  it("merges pages across apps and resumes each app cursor", async () => {
    const local = localSource([
      entry("local_2", "2026-01-02T10:00:00.000Z"),
      entry("local_1", "2026-01-01T10:00:00.000Z"),
    ])
    const remoteList = vi.fn(
      async (_organizationId: string, input: AuditPageInput) => ({
        items: input.cursor
          ? []
          : [entry("remote_2", "2026-01-02T12:00:00.000Z")],
        nextCursor: null,
        total: 1,
      })
    )
    const remotes = [remote("projects", { list: remoteList })]

    const first = await listAuditAcrossApps(
      "org_1",
      { limit: 2 },
      local,
      remotes
    )
    expect(first.items.map((item) => item.id)).toEqual(["remote_2", "local_2"])
    expect(first.nextCursor).not.toBeNull()

    const second = await listAuditAcrossApps(
      "org_1",
      { limit: 2, cursor: first.nextCursor },
      local,
      remotes
    )
    expect(second.items.map((item) => item.id)).toEqual(["local_1"])
    expect(second.nextCursor).toBeNull()
  })

  it("returns partial results when one app is down", async () => {
    const local = localSource([entry("local_1", "2026-01-01T10:00:00.000Z")])
    const remotes = [
      remote("projects", {
        list: async () => {
          throw Object.assign(new Error("down"), {
            code: "unavailable",
            message: "Projects is unavailable",
          })
        },
      }),
    ]

    const page = await listAuditAcrossApps("org_1", {}, local, remotes)
    expect(page.items.map((item) => item.id)).toEqual(["local_1"])
    expect(page.partial).toBe(true)
    expect(page.unavailableApps).toEqual([
      {
        app: "projects",
        code: "unavailable",
        message: "Projects is unavailable",
      },
    ])
  })

  it("merges facet counts", async () => {
    const local = localSource([])
    const remotes = [
      remote("projects", {
        facets: async () => ({
          actions: [{ value: "project.created", count: 3 }],
          entityTypes: [{ value: "project", count: 3 }],
          actors: [{ id: "user_1", name: "Ada" }],
        }),
      }),
    ]

    const facets = await facetsAcrossApps("org_1", local, remotes)
    expect(facets.actions).toEqual([{ value: "project.created", count: 5 }])
    expect(facets.actors).toEqual([{ id: "user_1", name: "Ada" }])
  })

  it("merges an export in ascending order and caps it", async () => {
    const local = localSource([
      entry("local_2", "2026-01-02T10:00:00.000Z"),
      entry("local_1", "2026-01-01T10:00:00.000Z"),
    ])
    const remotes = [
      remote("projects", {
        export: async () => ({
          entries: [entry("remote_1", "2026-01-01T09:00:00.000Z")],
          truncated: true,
        }),
      }),
    ]

    const result = await exportAuditAcrossApps("org_1", {}, local, remotes, 2)
    expect(result.entries.map((item) => item.id)).toEqual([
      "remote_1",
      "local_1",
    ])
    expect(result.truncated).toBe(true)
  })
})
