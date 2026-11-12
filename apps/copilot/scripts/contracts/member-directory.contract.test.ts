import { describe, expect, it } from "vitest"

import {
  toDirectoryEntry,
  toMemberDirectoryEntry,
} from "@workspace/organization/directory"
import {
  normalizeRecents,
  RECENTS_MAX_STORED,
  recentsStorageKey,
} from "@workspace/app-shell/recents-storage"

describe("member directory contract", () => {
  it("maps joined identity rows to the shared directory shape", () => {
    const source = (role: string) => ({
      userId: "user_1",
      role,
      user: { name: "Ada", email: "ada@example.com", image: null },
    })

    expect(toMemberDirectoryEntry(source("admin"))).toEqual({
      id: "user_1",
      name: "Ada",
      email: "ada@example.com",
      avatarUrl: undefined,
      role: "admin",
      roles: ["admin"],
    })
    expect(toMemberDirectoryEntry(source("client")).role).toBe("client")
    expect(toMemberDirectoryEntry(source("unknown")).role).toBe("member")
    // Cumulative roles survive the directory, primary role first (ADR 0040).
    expect(toMemberDirectoryEntry(source("developer,member"))).toMatchObject({
      role: "member",
      roles: ["member", "developer"],
    })
  })

  it("maps the identity API row used by every domain app", () => {
    expect(
      toDirectoryEntry({
        id: "user_2",
        name: "Grace",
        email: "grace@example.com",
        avatarUrl: null,
        role: "viewer",
        clientId: null,
        createdAt: new Date("2026-11-01T10:00:00Z"),
      })
    ).toEqual({
      userId: "user_2",
      name: "Grace",
      email: "grace@example.com",
      avatarUrl: undefined,
      role: "viewer",
      roles: ["viewer"],
      clientId: null,
      joinedAt: new Date("2026-11-01T10:00:00Z"),
    })
  })
})

describe("recents contract", () => {
  it("stores recents per organization so a workspace switch cannot leak", () => {
    expect(recentsStorageKey("org_a")).not.toBe(recentsStorageKey("org_b"))
    expect(recentsStorageKey("org_a")).toContain("org_a")
    expect(recentsStorageKey()).not.toContain("org_a")
  })

  it("normalizes every app bucket and bounds the shelf", () => {
    const recents = normalizeRecents({
      projects: [{ id: "p1", label: "Project", at: 1 }],
    })
    expect(Object.keys(recents).sort()).toEqual([
      "calendars",
      "files",
      "messages",
      "projects",
    ])
    expect(recents.projects).toHaveLength(1)
    expect(recents.messages).toEqual([])
    expect(RECENTS_MAX_STORED).toBeGreaterThan(0)

    const withUnknown = normalizeRecents({
      projects: [],
      unknownApp: [{ id: "x", label: "x", at: 1 }],
    } as Parameters<typeof normalizeRecents>[0])
    expect("unknownApp" in withUnknown).toBe(false)
  })
})
