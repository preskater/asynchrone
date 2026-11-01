import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { toMemberDirectoryEntry } from "@workspace/organization/directory"
import {
  normalizeRecents,
  RECENTS_MAX_STORED,
  recentsStorageKey,
} from "@workspace/app-shell/recents-storage"

import { contextForMember } from "@/lib/core/auth-context"
import { projectService } from "@/lib/projects"
import { prisma } from "@/lib/prisma"

import {
  createContractFixture,
  rejectionOf,
  type ContractFixture,
} from "./fixtures"

describe("member directory contract", () => {
  it("maps roles to the shared directory shape", () => {
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
    })
    expect(toMemberDirectoryEntry(source("client")).role).toBe("client")
    expect(toMemberDirectoryEntry(source("unknown")).role).toBe("member")
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

describe("member directory against the database", () => {
  let fixture: ContractFixture
  let portalUserId: string

  beforeAll(async () => {
    fixture = await createContractFixture()
    portalUserId = `user_contract_portal_a_${randomUUID().slice(0, 8)}`
    await prisma.user.create({
      data: {
        id: portalUserId,
        name: "Portal A",
        email: `${portalUserId}@contract.local`,
      },
    })
    await prisma.member.create({
      data: {
        id: `member_portal_a_${randomUUID().slice(0, 8)}`,
        organizationId: fixture.orgA,
        userId: portalUserId,
        role: "client",
        clientId: fixture.clientA,
        createdAt: new Date(),
      },
    })
  })

  afterAll(async () => {
    await prisma.user
      .deleteMany({ where: { id: portalUserId } })
      .catch(() => {})
    await fixture?.cleanup()
  })

  it("lists only internal members of the active organization", async () => {
    const members = await projectService.listMembers(fixture.ctxAlice)
    expect(members.map((member) => member.id)).toContain(fixture.users.alice)
    expect(members.map((member) => member.id)).not.toContain(portalUserId)

    const other = await projectService.listMembers(fixture.ctxMallory)
    expect(other.map((member) => member.id)).toEqual([fixture.users.mallory])
  })

  it("never turns a portal account into an internal context", async () => {
    const error = await rejectionOf(
      contextForMember(
        {
          id: portalUserId,
          name: "Portal A",
          email: `${portalUserId}@contract.local`,
        },
        fixture.orgA
      )
    )
    expect(error).toMatchObject({ code: "forbidden" })
  })
})
