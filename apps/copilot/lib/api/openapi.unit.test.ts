import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { buildOpenApiDocument } from "./openapi"

const API_DIR = path.resolve(__dirname, "../../app/api/v1")
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const

/** `{ "/api/v1/tasks/{taskId}": ["patch"] }` read from the route files. */
function routeMethods(dir = API_DIR, prefix = "/api/v1") {
  const found: Record<string, string[]> = {}
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      const segment = entry.replace(/^\[(.+)\]$/, "{$1}")
      Object.assign(found, routeMethods(full, `${prefix}/${segment}`))
    } else if (entry === "route.ts") {
      const source = readFileSync(full, "utf8")
      found[prefix] = METHODS.filter((method) =>
        new RegExp(`export (const|function|async function) ${method}\\b`).test(
          source
        )
      ).map((method) => method.toLowerCase())
    }
  }
  return found
}

describe("buildOpenApiDocument", () => {
  const document = buildOpenApiDocument("https://example.test")

  it("documents exactly the routes that exist", () => {
    const routes = routeMethods()
    delete routes["/api/v1/openapi.json"]
    const documented = Object.fromEntries(
      Object.entries(document.paths).map(([route, operations]) => [
        route,
        Object.keys(operations).sort(),
      ])
    )
    expect(documented).toEqual(
      Object.fromEntries(
        Object.entries(routes).map(([route, methods]) => [
          route,
          methods.sort(),
        ])
      )
    )
  })

  it("defaults createIssue to false in the published body", () => {
    const body = document.paths["/api/v1/tasks"].post.requestBody.content[
      "application/json"
    ].schema as {
      properties: Record<string, { default?: unknown }>
      required: string[]
    }
    expect(body.properties.createIssue?.default).toBe(false)
    expect(body.required).toEqual(
      expect.arrayContaining(["projectId", "title"])
    )
  })

  it("serialises to JSON", () => {
    expect(() => JSON.stringify(document)).not.toThrow()
  })
})
