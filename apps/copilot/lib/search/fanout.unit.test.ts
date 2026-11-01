import type { SearchClient, SearchResult } from "@workspace/contracts"
import { describe, expect, it } from "vitest"

import { searchAcrossApps, type SearchRemote } from "./fanout"

function result(id: string, type = "task"): SearchResult {
  return {
    app: "projects",
    type,
    id,
    title: id,
    url: `https://projects.example/${id}`,
  }
}

function remote(
  app: string,
  search: Partial<SearchClient>["search"]
): SearchRemote {
  return { app, client: { search } as SearchClient }
}

describe("search fan-out", () => {
  it("merges results and deduplicates one app", async () => {
    const remotes = [
      remote("projects", async () => ({
        results: [result("task_1"), result("task_1")],
      })),
      remote("files", async () => ({ results: [result("file_1", "file")] })),
    ]
    const output = await searchAcrossApps("org_1", "login", remotes)
    expect(output.results).toHaveLength(2)
    expect(output.partial).toBe(false)
  })

  it("returns partial results when an app times out or fails", async () => {
    const remotes = [
      remote("projects", async () => ({ results: [result("task_1")] })),
      remote("files", async () => {
        throw Object.assign(new Error("timed out"), {
          name: "TimeoutError",
          code: "timeout",
          message: "Search timed out",
        })
      }),
    ]
    const output = await searchAcrossApps("org_1", "login", remotes)
    expect(output.results.map((item) => item.id)).toEqual(["task_1"])
    expect(output.partial).toBe(true)
    expect(output.unavailableApps).toEqual([
      { app: "files", code: "timeout", message: "Search timed out" },
    ])
  })

  it("caps the merged result set", async () => {
    const remotes = [
      remote("projects", async () => ({
        results: [result("1"), result("2"), result("3")],
      })),
    ]
    expect(
      (await searchAcrossApps("org_1", "x", remotes, { limit: 2 })).results
    ).toHaveLength(2)
  })
})
