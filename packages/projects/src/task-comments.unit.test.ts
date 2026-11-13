import { describe, expect, it, vi } from "vitest"

import type { ProjectDb } from "./db"
import { createTaskComment } from "./task-comments"

function deps(task: unknown) {
  const changed = vi.fn(async (_organizationId: string) => undefined)
  const db = {
    task: { findFirst: vi.fn(async () => task) },
    taskComment: {
      create: vi.fn(async () => ({
        id: "c1",
        authorId: "u1",
        authorKind: "internal",
        authorName: "Ada",
        body: "hi",
        createdAt: new Date("2026-11-13T00:00:00Z"),
      })),
    },
  }
  return {
    changed,
    deps: {
      db: db as unknown as ProjectDb,
      notify: vi.fn(async () => undefined),
      directory: { list: vi.fn(async () => []) } as never,
      changed,
    },
  }
}

const input = {
  organizationId: "org_1",
  taskId: "t1",
  authorId: "u1",
  authorKind: "internal" as const,
  authorName: "Ada",
  body: "hi",
}

describe("createTaskComment real-time hint (#98)", () => {
  it("publishes for the organization once the comment is stored", async () => {
    const { deps: d, changed } = deps({
      id: "t1",
      identifier: "P-1",
      title: "Task",
      projectId: "p1",
      project: { name: "Project" },
    })
    await createTaskComment(d, input)
    expect(changed).toHaveBeenCalledWith("org_1")
  })

  it("publishes nothing when the task is not in the organization", async () => {
    const { deps: d, changed } = deps(null)
    await expect(createTaskComment(d, input)).rejects.toThrow()
    expect(changed).not.toHaveBeenCalled()
  })
})
