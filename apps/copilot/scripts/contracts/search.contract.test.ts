import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import { searchAcrossApps } from "@/lib/search/fanout"
import { inProcessSearchRemotes, searchWorkspace } from "@/lib/search"
import { prisma } from "@/lib/prisma"

import { createContractFixture, type ContractFixture } from "./fixtures"

const inProcessSource = readFileSync(
  fileURLToPath(new URL("../../lib/search/in-process.ts", import.meta.url)),
  "utf8"
)

describe("search architecture contract", () => {
  it("reads domains in process instead of calling app HTTP routes", () => {
    expect(inProcessSource).not.toMatch(/\bfetch\s*\(/)
    expect(inProcessSource).not.toMatch(
      /\b(SearchClient|SagaClient|ServiceTokenClient)\b/
    )
    expect(inProcessSource).not.toMatch(/https?:\/\//)
    expect(inProcessSource).toContain("@/lib/projects")
    expect(inProcessSource).toContain("@/lib/files")
    expect(inProcessSource).toContain("@/lib/messaging")
    expect(inProcessSource).toContain("@/lib/clients")
    expect(inProcessSource).toContain("@/lib/calendars")
  })

  it("keeps the HTTP fan-out failure model for split apps", async () => {
    const output = await searchAcrossApps("org_1", "login", [
      {
        app: "projects",
        client: {
          search: async () => ({
            results: [
              {
                app: "projects",
                type: "task",
                id: "task_1",
                title: "Login",
                url: "/org/projects/task_1",
              },
            ],
          }),
        },
      },
      {
        app: "files",
        client: {
          search: async () => {
            throw Object.assign(new Error("down"), {
              code: "unavailable",
              message: "Files unavailable",
            })
          },
        },
      },
    ])

    expect(output.partial).toBe(true)
    expect(output.unavailableApps.map((entry) => entry.app)).toEqual(["files"])
    expect(output.results).toHaveLength(1)
  })
})

describe("search against the domain packages", () => {
  let fixture: ContractFixture
  let outsider: string
  let ctxOutsider: RequestContext

  beforeAll(async () => {
    fixture = await createContractFixture()
    outsider = `user_contract_outsider_${fixture.suffix}`
    await prisma.user.create({
      data: {
        id: outsider,
        name: "Outsider",
        email: `${outsider}@contract.local`,
      },
    })
    await prisma.member.create({
      data: {
        id: `member_outsider_${fixture.suffix}`,
        organizationId: fixture.orgA,
        userId: outsider,
        role: "member",
        createdAt: new Date(),
      },
    })
    ctxOutsider = {
      userId: outsider,
      userName: "Outsider",
      organizationId: fixture.orgA,
      userEmail: `${outsider}@contract.local`,
      role: "member",
    }
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: outsider } }).catch(() => {})
    await fixture?.cleanup()
  })

  it("offers every in-process domain through the transport contract", async () => {
    const remotes = inProcessSearchRemotes(fixture.ctxAlice, fixture.slugA)
    expect(remotes.map((remote) => remote.app).sort()).toEqual([
      "calendars",
      "clients",
      "files",
      "messages",
      "projects",
    ])

    for (const remote of remotes) {
      await expect(
        remote.client.search(fixture.orgB, "Secret", 20)
      ).resolves.toEqual({ results: [] })
    }
  })

  it("returns results only from the active workspace", async () => {
    const output = await searchWorkspace(
      fixture.ctxAlice,
      fixture.slugA,
      "Secret",
      { limit: 50 }
    )
    expect(output.results.length).toBeGreaterThan(0)
    expect(
      output.results.every((result) =>
        result.url.startsWith(`/${fixture.slugA}/`)
      )
    ).toBe(true)
    expect(
      output.results.some((result) => result.title.includes("Secret task"))
    ).toBe(true)

    const other = await searchWorkspace(
      fixture.ctxMallory,
      fixture.slugB,
      "Secret"
    )
    expect(other.results).toEqual([])
  })

  it("does not leak a conversation to an internal member who was not invited", async () => {
    const output = await searchWorkspace(
      ctxOutsider,
      fixture.slugA,
      "secret message"
    )
    expect(
      output.results.some(
        (result) => result.app === "messages" && result.type === "message"
      )
    ).toBe(false)
  })

  it("respects the requested limit", async () => {
    const output = await searchWorkspace(
      fixture.ctxAlice,
      fixture.slugA,
      "Secret",
      { limit: 2 }
    )
    expect(output.results.length).toBeLessThanOrEqual(2)
  })
})
