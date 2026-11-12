import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { configPath, resolveConfig, writeConfig } from "./config.js"
import { EXIT, exitCodeForStatus } from "./errors.js"
import { main, splitGlobals } from "./main.js"

const TOKEN = "asy_abcdefgh_" + "x".repeat(43)
const project = {
  id: "proj_1",
  name: "Website",
  status: "active",
  labels: [{ id: "lab_bug", name: "Bug", color: "#f00" }],
}
const task = {
  id: "task_1",
  identifier: "WEB-7",
  projectId: "proj_1",
  title: "Fix login",
  status: "todo",
  priority: "high",
  labelIds: ["lab_bug"],
  url: "https://projects.test/en/acme/projects/proj_1?task=task_1",
}

type Call = {
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
}
let calls: Call[]
let routes: Record<
  string,
  { status?: number; body: unknown; headers?: Record<string, string> }
>
let dir: string
let out: string[]
let stderr: string[]

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

beforeEach(async () => {
  calls = []
  out = []
  stderr = []
  dir = await mkdtemp(path.join(tmpdir(), "asynchrone-cli-"))
  routes = {
    "GET /projects": { body: { data: [project] } },
    "GET /members": {
      body: {
        data: [
          {
            id: "user_2",
            name: "Lina",
            email: "lina@acme.test",
            roles: ["member"],
          },
        ],
      },
    },
    "GET /token": {
      body: {
        data: {
          prefix: "asy_abcdefgh",
          scopes: ["tasks:write"],
          expiresAt: "2027-01-01T00:00:00.000Z",
          user: { id: "user_1", name: "Ada", email: "ada@acme.test" },
          organization: { id: "org_1", name: "Acme", slug: "acme" },
        },
      },
    },
    "GET /tasks?projectId=proj_1": { body: { data: [task] } },
    "POST /tasks": { status: 201, body: { data: task } },
    "PATCH /tasks/task_1": { body: { data: { ...task, status: "done" } } },
  }
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const pathAndQuery = url.replace("https://api.test/api/v1", "")
    const key = `${init.method} ${pathAndQuery}`
    calls.push({
      method: init.method!,
      url,
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    })
    const route = routes[key]
    return route
      ? json(route.status ?? 200, route.body, route.headers)
      : json(404, { error: { code: "not_found", message: `No route ${key}` } })
  })
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk))
    return true
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

function cli(
  args: string[],
  extra: { stdin?: string; env?: Record<string, string> } = {}
) {
  return main(
    args,
    {
      XDG_CONFIG_HOME: dir,
      ASYNCHRONE_API_URL: "https://api.test",
      ASYNCHRONE_TOKEN: TOKEN,
      ...extra.env,
    },
    {
      out: (line) => out.push(line),
      readStdin: async () => extra.stdin ?? "",
      readFile: async () => "from file\n",
    }
  )
}

describe("configuration", () => {
  it("prefers the flag, then the environment, then the file", () => {
    const stored = { token: "file", apiUrl: "https://file.test" }
    expect(
      resolveConfig({ token: "flag" }, { ASYNCHRONE_TOKEN: "env" }, stored)
    ).toMatchObject({
      token: "flag",
      tokenSource: "flag",
      apiUrl: "https://file.test",
    })
    expect(
      resolveConfig({}, { ASYNCHRONE_TOKEN: "env" }, stored).tokenSource
    ).toBe("env")
    expect(resolveConfig({}, {}, stored).tokenSource).toBe("file")
    expect(resolveConfig({}, {}, {})).toMatchObject({
      token: null,
      apiUrl: "https://copilot.asynchrone.space",
    })
  })

  it("writes the token file readable by its owner only", async () => {
    const file = configPath({ XDG_CONFIG_HOME: dir })
    await writeConfig(file, { token: TOKEN })
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })

  it("reads global flags anywhere, with or without =", () => {
    expect(
      splitGlobals(["tasks", "--json", "list", "--token=t", "--api-url", "u"])
    ).toEqual({
      globals: { token: "t", apiUrl: "u", json: true, help: false },
      rest: ["tasks", "list"],
    })
  })
})

describe("exit codes", () => {
  it("maps HTTP statuses", () => {
    expect(exitCodeForStatus(401)).toBe(EXIT.auth)
    expect(exitCodeForStatus(403)).toBe(EXIT.forbidden)
    expect(exitCodeForStatus(429)).toBe(EXIT.rateLimited)
    expect(exitCodeForStatus(422)).toBe(EXIT.invalidInput)
    expect(exitCodeForStatus(500)).toBe(EXIT.failure)
  })

  it("returns 3 with a hint for an expired token", async () => {
    routes["GET /projects"] = {
      status: 401,
      body: {
        error: { code: "token_expired", message: "The API token has expired." },
      },
    }
    expect(await cli(["projects", "list"])).toBe(EXIT.auth)
    expect(stderr.join("")).toContain("token_expired")
    expect(stderr.join("")).toContain("Settings → Developers")
  })

  it("returns 5 and the wait for a rate limit", async () => {
    routes["GET /projects"] = {
      status: 429,
      body: { error: { code: "rate_limited", message: "Too many requests." } },
      headers: { "retry-after": "30" },
    }
    expect(await cli(["projects", "list"])).toBe(EXIT.rateLimited)
    expect(stderr.join("")).toContain("Retry after 30s")
  })

  it("returns 3 without calling the API when there is no token", async () => {
    expect(
      await cli(["projects", "list"], { env: { ASYNCHRONE_TOKEN: "" } })
    ).toBe(EXIT.auth)
    expect(calls).toHaveLength(0)
  })

  it("returns 2 for an unknown option or command", async () => {
    expect(await cli(["tasks", "create", "--nope"])).toBe(EXIT.invalidInput)
    expect(await cli(["tasks", "explode"])).toBe(EXIT.invalidInput)
  })
})

describe("tasks create", () => {
  it("resolves the project, label and assignee and never opens an issue by default", async () => {
    const code = await cli([
      "tasks",
      "create",
      "--project",
      "website",
      "--title",
      " Fix login ",
      "--priority",
      "high",
      "--label",
      "bug",
      "--assignee",
      "lina@acme.test",
      "--due",
      "2026-12-31",
      "--idempotency-key",
      "ci-42",
      "--json",
    ])
    expect(code).toBe(EXIT.ok)
    const post = calls.find((call) => call.method === "POST")!
    expect(post.body).toEqual({
      projectId: "proj_1",
      title: "Fix login",
      priority: "high",
      assigneeId: "user_2",
      labelIds: ["lab_bug"],
      dueDate: "2026-12-31",
      createIssue: false,
    })
    expect(post.headers["Idempotency-Key"]).toBe("ci-42")
    expect(post.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(out.join("\n"))).toMatchObject({
      identifier: "WEB-7",
      url: task.url,
    })
  })

  it("reads a long description from stdin", async () => {
    await cli(
      [
        "tasks",
        "create",
        "--project",
        "proj_1",
        "--title",
        "T",
        "--description-file",
        "-",
      ],
      {
        stdin: "line 1\nline 2\n\n",
      }
    )
    expect(calls.find((call) => call.method === "POST")!.body).toMatchObject({
      description: "line 1\nline 2",
    })
  })

  it("sends nothing on --dry-run", async () => {
    expect(
      await cli([
        "tasks",
        "create",
        "--project",
        "proj_1",
        "--title",
        "T",
        "--dry-run",
      ])
    ).toBe(EXIT.ok)
    expect(calls.some((call) => call.method === "POST")).toBe(false)
    expect(out.join("\n")).toContain("Dry run")
  })

  it.each([
    [["--title", "T"], "--project"],
    [["--project", "proj_1"], "--title"],
    [
      ["--project", "proj_1", "--title", "T", "--priority", "huge"],
      "--priority",
    ],
    [["--project", "proj_1", "--title", "T", "--due", "31/12/2026"], "--due"],
    [["--project", "proj_1", "--title", "T", "--label", "Nope"], "no label"],
    [["--project", "Unknown", "--title", "T"], "No project"],
  ])("refuses %j with exit 2", async (args, message) => {
    expect(await cli(["tasks", "create", ...args])).toBe(EXIT.invalidInput)
    expect(stderr.join("")).toContain(message)
    expect(calls.some((call) => call.method === "POST")).toBe(false)
  })
})

describe("tasks update", () => {
  it("resolves a task key within its project", async () => {
    expect(
      await cli([
        "tasks",
        "update",
        "web-7",
        "--project",
        "Website",
        "--status",
        "done",
      ])
    ).toBe(EXIT.ok)
    const patch = calls.find((call) => call.method === "PATCH")!
    expect(patch.url).toBe("https://api.test/api/v1/tasks/task_1")
    expect(patch.body).toEqual({ status: "done" })
  })

  it("needs a project to resolve a key", async () => {
    expect(await cli(["tasks", "update", "WEB-7", "--status", "done"])).toBe(
      EXIT.invalidInput
    )
  })

  it("clears the assignee and the due date with none", async () => {
    await cli([
      "tasks",
      "update",
      "task_1",
      "--assignee",
      "none",
      "--due",
      "none",
    ])
    expect(calls.find((call) => call.method === "PATCH")!.body).toEqual({
      assigneeId: null,
      dueDate: null,
    })
  })

  it("assigns to the token owner with me", async () => {
    await cli(["tasks", "update", "task_1", "--assignee", "me"])
    expect(calls.find((call) => call.method === "PATCH")!.body).toEqual({
      assigneeId: "user_1",
    })
  })
})

describe("auth", () => {
  it("saves the token after checking it", async () => {
    expect(
      await cli(
        ["auth", "login", "--token", TOKEN, "--api-url", "https://api.test"],
        {
          env: { ASYNCHRONE_TOKEN: "" },
        }
      )
    ).toBe(EXIT.ok)
    const saved = JSON.parse(
      await readFile(configPath({ XDG_CONFIG_HOME: dir }), "utf8")
    )
    expect(saved).toEqual({ token: TOKEN, apiUrl: "https://api.test" })
    expect(out.join("\n")).toContain("Logged in as Ada")
  })

  it("does not save a rejected token", async () => {
    routes["GET /token"] = {
      status: 401,
      body: {
        error: { code: "token_invalid", message: "The API token is invalid." },
      },
    }
    expect(await cli(["auth", "login", "--token", TOKEN])).toBe(EXIT.auth)
    await expect(stat(configPath({ XDG_CONFIG_HOME: dir }))).rejects.toThrow()
  })
})
