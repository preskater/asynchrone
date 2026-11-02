import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { searchAcrossApps } from "@/lib/search/fanout"

const inProcessFile = fileURLToPath(
  new URL("../../lib/search/in-process.ts", import.meta.url)
)

describe("search architecture contract", () => {
  it("never searches a domain app in process", () => {
    expect(existsSync(inProcessFile)).toBe(false)
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

  it("passes the route organization and locale to the remote", async () => {
    let seen: unknown
    const output = await searchAcrossApps(
      "org_1",
      "login",
      [
        {
          app: "projects",
          client: {
            search: async (...args: unknown[]) => {
              seen = args[4]
              return { results: [] }
            },
          },
        },
      ],
      { organizationSlug: "acme", locale: "fr" }
    )
    expect(seen).toEqual({ organizationSlug: "acme", locale: "fr" })
    expect(output.partial).toBe(false)
  })
})
