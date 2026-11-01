import { describe, expect, it, vi } from "vitest"

import type { ProjectDb } from "../db"
import type { RepositoryConnectionRow } from "./repository"
import {
  applyRemoteIssue,
  createTaskFromIssue,
  issueNumberFromPullRequest,
  issueStateForStatus,
  parseRemoteDate,
} from "./sync"

const connection = {
  id: "conn_1",
  organizationId: "org_1",
  projectId: "project_1",
  provider: "github",
  baseUrl: null,
  owner: "acme",
  repo: "site",
  repoUrl: "https://github.com/acme/site",
  webhookSecret: "secret",
  createdById: "user_1",
  lastSyncedAt: null,
  createdAt: new Date("2026-11-01T10:00:00Z"),
  updatedAt: new Date("2026-11-01T10:00:00Z"),
} satisfies RepositoryConnectionRow

describe("repository sync primitives", () => {
  it("closes the issue only for done tasks", () => {
    expect(issueStateForStatus("done")).toBe("closed")
    expect(issueStateForStatus("review")).toBe("open")
    expect(issueStateForStatus("todo")).toBe("open")
  })

  it("parses provider timestamps and ignores invalid ones", () => {
    expect(parseRemoteDate("2026-11-01T10:00:00Z")?.toISOString()).toBe(
      "2026-11-01T10:00:00.000Z"
    )
    expect(parseRemoteDate("not-a-date")).toBeNull()
  })

  it("resolves the issue behind a pull request branch or body", () => {
    expect(
      issueNumberFromPullRequest({
        number: 4,
        title: "WEB-3: Ship it",
        body: "",
        url: "https://example.test/pr/4",
        state: "open",
        sourceBranch: "asynchrone-space/3-ship-it",
        targetBranch: "main",
      })
    ).toBe(3)
    expect(
      issueNumberFromPullRequest({
        number: 5,
        title: "Fix login",
        body: "Closes #12",
        url: "https://example.test/pr/5",
        state: "open",
        sourceBranch: "fix/login",
        targetBranch: "main",
      })
    ).toBe(12)
    expect(
      issueNumberFromPullRequest({
        number: 6,
        title: "No reference",
        body: "",
        url: "https://example.test/pr/6",
        state: "open",
        sourceBranch: "random",
        targetBranch: "main",
      })
    ).toBeNull()
  })
})

describe("remote issue application", () => {
  const task = {
    id: "task_1",
    organizationId: "org_1",
    projectId: "project_1",
    identifier: "WEB-1",
    title: "Old title",
    description: null,
    status: "todo",
    priority: "medium",
    order: 0,
    createIssue: true,
    assigneeId: null,
    dueDate: null,
    endDate: null,
    templateId: null,
    customFields: {},
    externalIssueNumber: 3,
    externalIssueUrl: "https://example.test/issues/3",
    externalPrNumber: null,
    externalPrUrl: null,
    externalUpdatedAt: new Date("2026-11-01T10:00:00Z"),
    createdAt: new Date("2026-11-01T09:00:00Z"),
    updatedAt: new Date("2026-11-01T09:30:00Z"),
    subtasks: [],
    comments: [],
    labels: [],
  }

  const issue = {
    number: 3,
    title: "New title",
    body: "Body",
    state: "open" as const,
    url: "https://example.test/issues/3",
    updatedAt: "2026-11-01T11:00:00Z",
  }

  it("ignores an equal or older remote revision", async () => {
    const update = vi.fn()
    const db = { task: { update } } as unknown as ProjectDb

    await expect(
      applyRemoteIssue(db, task, {
        ...issue,
        updatedAt: "2026-11-01T10:00:00Z",
      })
    ).resolves.toBe("stale")
    expect(update).not.toHaveBeenCalled()
  })

  it("applies a newer remote revision and closes a done task", async () => {
    const update = vi.fn(async () => undefined)
    const db = { task: { update } } as unknown as ProjectDb

    await expect(applyRemoteIssue(db, task, issue)).resolves.toBe("updated")
    expect(update).toHaveBeenCalledWith({
      where: { id: "task_1" },
      data: expect.objectContaining({
        title: "New title",
        description: "Body",
        status: "todo",
      }),
    })
  })

  it("reopens a task whose issue was reopened", async () => {
    const update = vi.fn(async () => undefined)
    const db = { task: { update } } as unknown as ProjectDb

    await applyRemoteIssue(db, { ...task, status: "done" }, issue)

    expect(update).toHaveBeenCalledWith({
      where: { id: "task_1" },
      data: expect.objectContaining({ status: "todo" }),
    })
  })

  it("imports a new open issue with the shared identifier counter", async () => {
    const create = vi.fn(async () => undefined)
    const db = {
      project: {
        findUnique: vi.fn(async () => ({ name: "Website" })),
      },
      task: {
        findMany: vi.fn(async () => [
          { identifier: "WEB-1", order: 0 },
          { identifier: "WEB-2", order: 1 },
        ]),
        create,
      },
      $queryRaw: vi.fn(async () => [{ value: 3 }]),
    } as unknown as ProjectDb

    await createTaskFromIssue(db, connection, issue)

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identifier: "WEB-3",
        title: "New title",
        status: "todo",
        order: 2,
        externalIssueNumber: 3,
      }),
    })
  })
})
