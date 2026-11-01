import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import { allMcpTools } from "@/lib/mcp/server"
import { assistantTools } from "@/lib/assistant/tools"

import { createContractFixture, type ContractFixture } from "./fixtures"

const toolsDir = fileURLToPath(new URL("../../lib/mcp/tools", import.meta.url))
const assistantFile = fileURLToPath(
  new URL("../../lib/assistant/tools.ts", import.meta.url)
)
const webLib = fileURLToPath(new URL("../../lib", import.meta.url))

/** Tool module → the domain package its app adapter must bind in process. */
const ADAPTER_PACKAGES: Record<string, string> = {
  "calendars.ts": "@workspace/calendars",
  "clients.ts": "@workspace/clients",
  "employees.ts": "@workspace/employees",
  "files.ts": "@workspace/files",
  "meetings.ts": "@workspace/meetings",
  "messaging.ts": "@workspace/messaging",
  "projects.ts": "@workspace/projects",
}

function toolSources() {
  const files = readdirSync(toolsDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({
      name,
      source: readFileSync(join(toolsDir, name), "utf8"),
    }))
  return [
    ...files,
    { name: "assistant/tools.ts", source: readFileSync(assistantFile, "utf8") },
  ]
}

function adapterSource(relative: string) {
  return readFileSync(join(webLib, relative), "utf8")
}

function tool(name: string) {
  const found = allMcpTools.find((candidate) => candidate.name === name)
  expect(found, `missing MCP tool ${name}`).toBeDefined()
  return found!
}

describe("MCP and assistant tool contract", () => {
  it("never reaches for an HTTP route or a service client", () => {
    for (const { name, source } of toolSources()) {
      expect(source, `${name} must not call fetch`).not.toMatch(/\bfetch\s*\(/)
      expect(source, `${name} must not import an app route`).not.toMatch(
        /from\s+["']@\/app\//
      )
      expect(source, `${name} must not use the search fan-out`).not.toMatch(
        /@\/lib\/search/
      )
      expect(source, `${name} must not build service clients`).not.toMatch(
        /\b(SearchClient|SagaClient|ServiceTokenClient|IdentityAdminClient)\b/
      )
      expect(source, `${name} must not hard-code an origin`).not.toMatch(
        /https?:\/\//
      )
    }
  })

  it("runs every domain tool through the package adapter", () => {
    const assistant = readFileSync(assistantFile, "utf8")
    for (const adapter of [
      "@/lib/projects",
      "@/lib/calendars",
      "@/lib/files",
      "@/lib/messaging",
    ]) {
      expect(assistant).toContain(adapter)
    }

    for (const [file, packageName] of Object.entries(ADAPTER_PACKAGES)) {
      const source = readFileSync(join(toolsDir, file), "utf8")
      expect(source, `${file} must import a package schema`).toMatch(
        new RegExp(`["']${packageName.replace("/", "\\/")}`)
      )
    }

    expect(adapterSource("projects/index.ts")).toContain(
      "@workspace/projects/service"
    )
    expect(adapterSource("clients/index.ts")).toContain(
      "@workspace/clients/service"
    )
    expect(adapterSource("employees/index.ts")).toContain(
      "@workspace/employees/service"
    )
    expect(adapterSource("calendars/index.ts")).toContain(
      "@workspace/calendars"
    )
    expect(adapterSource("meetings/index.ts")).toContain("@workspace/meetings")
    expect(adapterSource("files.ts")).toContain("@workspace/files")
    expect(adapterSource("messaging.ts")).toContain("@workspace/messaging")
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

describe("MCP tools against another organization", () => {
  let fixture: ContractFixture

  beforeAll(async () => {
    fixture = await createContractFixture()
  })

  afterAll(async () => {
    await fixture?.cleanup()
  })

  function run(
    name: string,
    ctx: RequestContext,
    input: Record<string, unknown>
  ) {
    return tool(name).run(ctx, input)
  }

  it("lists only the active organization's projects", async () => {
    const projects = (await run("list_projects", fixture.ctxAlice, {})) as {
      projects: { id: string }[]
    }
    expect(projects.projects.map((project) => project.id)).toContain(
      fixture.projectA
    )
    expect(projects.projects.map((project) => project.id)).not.toContain(
      fixture.projectB
    )
  })

  it("rejects cross-organization ids at every domain boundary", async () => {
    const attempts = [
      run("get_project", fixture.ctxMallory, { projectId: fixture.projectA }),
      run("get_client", fixture.ctxMallory, { clientId: fixture.clientA }),
      run("rename_file", fixture.ctxMallory, {
        fileId: fixture.fileA,
        name: "hijacked.txt",
      }),
      run("list_messages", fixture.ctxMallory, {
        conversationId: fixture.conversationA,
      }),
      run("respond_to_event", fixture.ctxMallory, {
        eventId: fixture.eventA,
        response: "declined",
      }),
      run("decide_leave", fixture.ctxMallory, {
        requestId: fixture.leaveA,
        decision: "approved",
      }),
      run("accept_meeting_request", fixture.ctxMallory, {
        id: fixture.meetingRequestA,
        slotId: fixture.meetingSlotA,
      }),
    ]

    const results = await Promise.allSettled(attempts)
    for (const result of results) {
      expect(result.status).toBe("rejected")
    }
  })
})
