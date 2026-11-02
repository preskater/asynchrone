import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { DomainClient, type DelegatedContext } from "@workspace/contracts"

import { allMcpTools } from "@/lib/mcp/server"
import { assistantTools } from "@/lib/assistant/tools"

const toolsDir = fileURLToPath(new URL("../../lib/mcp/tools", import.meta.url))
const assistantFile = fileURLToPath(
  new URL("../../lib/assistant/tools.ts", import.meta.url)
)
const portalFile = fileURLToPath(
  new URL("../../lib/portal/index.ts", import.meta.url)
)
const gatewayFile = fileURLToPath(
  new URL("../../lib/internal/domain.ts", import.meta.url)
)

function toolSources() {
  return [
    ...readdirSync(toolsDir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => ({
        name,
        source: readFileSync(join(toolsDir, name), "utf8"),
      })),
    { name: "assistant/tools.ts", source: readFileSync(assistantFile, "utf8") },
  ]
}

const DOMAIN_ADAPTERS = [
  "@/lib/projects",
  "@/lib/calendars",
  "@/lib/files",
  "@/lib/messaging",
  "@/lib/clients",
  "@/lib/employees",
  "@/lib/meetings",
]

const context: DelegatedContext = {
  userId: "user_a",
  userName: "Alice",
  userEmail: "alice@example.com",
  organizationId: "org_a",
  role: "member",
  impersonatedBy: null,
  portal: null,
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function errorResponse(
  status: number,
  code: string,
  message: string
): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function client(fetchImpl: typeof fetch) {
  return new DomainClient({
    app: "projects",
    baseUrl: "https://projects.test",
    getToken: async () => "service-token",
    fetchImpl,
    retryDelayMs: 0,
  })
}

describe("assistant, MCP and portal call typed domain clients", () => {
  it("never imports an in-process domain adapter or a Prisma client", () => {
    for (const { name, source } of toolSources()) {
      for (const adapter of DOMAIN_ADAPTERS) {
        expect(source, `${name} must not import ${adapter}`).not.toContain(
          `from "${adapter}"`
        )
      }
      expect(source, `${name} must use the internal gateway`).toContain(
        "@/lib/internal/domain"
      )
      expect(source, `${name} must not call fetch`).not.toMatch(/\bfetch\s*\(/)
      expect(source, `${name} must not import Prisma`).not.toMatch(
        /@prisma\/client|@workspace\/db/
      )
    }

    const portal = readFileSync(portalFile, "utf8")
    expect(portal).toContain("@/lib/internal/domain")
    expect(portal).not.toContain("@/lib/projects")
    expect(portal).not.toContain("@/lib/files")
    expect(portal).not.toContain("@/lib/messaging")
    expect(portal).not.toContain("@/lib/meetings")

    const gateway = readFileSync(gatewayFile, "utf8")
    expect(gateway).toContain("DomainClient")
    expect(gateway).toContain("delegatedPortalContext")
  })

  it("keeps a well-formed, read/write annotated surface", () => {
    for (const entry of allMcpTools) {
      expect(entry.name).toMatch(/^[a-z][a-z0-9_]+$/)
      expect(entry.description.length).toBeGreaterThan(10)
      expect(typeof entry.run).toBe("function")
      expect(typeof entry.readOnly).toBe("boolean")
    }
    for (const entry of assistantTools) {
      expect(entry.name).toMatch(/^[a-z][a-z0-9_]+$/)
      expect("parameters" in entry && entry.parameters).toBeTruthy()
    }
  })
})

describe("DomainClient failure modes", () => {
  it("retries a transient read and returns the typed payload", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(503, "unavailable", "try again"))
      .mockResolvedValueOnce(
        jsonResponse({
          projects: [{ id: "project_a" }],
        })
      )

    const result = await client(fetchImpl).call(
      "list-projects",
      context,
      {},
      z.object({ projects: z.array(z.object({ id: z.string() })) })
    )

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.projects[0]?.id).toBe("project_a")
  })

  it("does not retry an unkeyed mutation", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(errorResponse(503, "unavailable", "try again"))

    await expect(
      client(fetchImpl).call(
        "create-project",
        context,
        { name: "Nope" },
        z.unknown()
      )
    ).rejects.toMatchObject({ code: "unavailable" })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("retries a keyed mutation and forwards the idempotency key", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(503, "unavailable", "try again"))
      .mockResolvedValueOnce(jsonResponse({ id: "project_a" }))

    await client(fetchImpl).call(
      "create-project",
      context,
      { name: "Project" },
      z.object({ id: z.string() }),
      { idempotencyKey: "same-request" }
    )

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    for (const call of fetchImpl.mock.calls) {
      expect(
        (call[1]?.headers as Record<string, string>)["Idempotency-Key"]
      ).toBe("same-request")
    }
  })

  it("surfaces a cross-organization rejection as a typed error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(errorResponse(404, "not_found", "Project not found"))

    await expect(
      client(fetchImpl).getPortalProject(context, "project_b")
    ).rejects.toMatchObject({
      name: "DomainClientError",
      code: "not_found",
      status: 404,
    })
  })

  it("times out instead of hanging a tool call", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
        })
    )

    await expect(
      new DomainClient({
        app: "projects",
        baseUrl: "https://projects.test",
        getToken: async () => "service-token",
        fetchImpl,
        timeoutMs: 5,
        readRetries: 0,
      }).call("list-projects", context, {}, z.unknown())
    ).rejects.toMatchObject({ code: "domain_unavailable" })
  })
})
