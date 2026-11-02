import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RequestContext } from "@workspace/core/context"
import { ForbiddenError, NotFoundError } from "@workspace/core/errors"

import type { ProjectDb } from "./db"
import type { ProjectServicePorts } from "./ports"
import type { ProjectRepository } from "./repository"
import { ProjectService } from "./service"

const ORG = "org_1"
const USER = "user_member"

function context(role: RequestContext["role"]): RequestContext {
  return {
    userId: USER,
    userName: "Ada",
    userEmail: "ada@example.com",
    organizationId: ORG,
    role,
  }
}

const project = {
  id: "project_1",
  organizationId: ORG,
  name: "Website",
  description: null,
  status: "active",
  clientId: null,
  client: null,
  clientVisible: true,
  clientDiscussion: "read_write",
  clientTaskComments: "read_write",
  members: [{ userId: USER }],
  labels: [],
  repository: null,
  _count: { tasks: 0 },
  createdAt: new Date("2026-11-01T10:00:00Z"),
  dueDate: null,
}

const createdTask = {
  id: "task_1",
  identifier: "WEB-1",
  projectId: project.id,
  title: "Ship it",
  description: null,
  status: "todo",
  priority: "medium",
  assigneeId: null,
  dueDate: null,
  endDate: null,
  templateId: null,
  customFields: {},
  externalIssueNumber: null,
  externalIssueUrl: null,
  externalPrNumber: null,
  externalPrUrl: null,
  createdAt: new Date("2026-11-01T10:01:00Z"),
  subtasks: [],
  comments: [],
  labels: [],
}

function fakeRepository() {
  return {
    findById: vi.fn(async () => project),
    listTasks: vi.fn(async () => []),
    createTask: vi.fn(async () => createdTask),
    findTask: vi.fn(
      async (): Promise<typeof createdTask | null> => createdTask
    ),
    updateTask: vi.fn(async () => createdTask),
    addActivity: vi.fn(async () => undefined),
    addComment: vi.fn(async () => undefined),
    findTemplate: vi.fn(async () => null),
    listMembers: vi.fn(async () => []),
    listTemplates: vi.fn(async () => []),
    listLabels: vi.fn(async () => []),
  }
}

function ports(
  overrides: Partial<ProjectServicePorts> = {}
): ProjectServicePorts {
  return {
    audit: vi.fn(async () => undefined),
    notify: vi.fn(async () => undefined),
    directory: {
      list: vi.fn(async () => []),
      find: vi.fn(async () => null),
      findByEmail: vi.fn(async () => null),
      countOwners: vi.fn(async () => 0),
      add: vi.fn(async () => ({
        userId: "u",
        name: "User",
        email: "user@example.com",
        role: "member" as const,
      })),
      updateRole: vi.fn(async () => ({
        userId: "u",
        name: "User",
        email: "user@example.com",
        role: "member" as const,
      })),
      remove: vi.fn(async () => ({ id: "u" })),
    },
    repository: {
      createTaskInRepository: vi.fn(async () => null),
      pushTaskStatus: vi.fn(async () => undefined),
      scheduleContentPush: vi.fn(),
      closeTaskIssue: vi.fn(async () => undefined),
    },
    ...overrides,
  }
}

function service(repo: ReturnType<typeof fakeRepository>, p = ports()) {
  const db = {
    $queryRaw: vi.fn(async () => [{ value: 1 }]),
  } as unknown as ProjectDb
  return {
    projectService: new ProjectService(
      repo as unknown as ProjectRepository,
      db,
      p
    ),
    ports: p,
  }
}

const taskInput = {
  projectId: project.id,
  title: "Ship it",
}

describe("ProjectService task authorization", () => {
  let repo: ReturnType<typeof fakeRepository>

  beforeEach(() => {
    repo = fakeRepository()
  })

  it("refuses task creation for a viewer before touching the repository", async () => {
    const { projectService, ports: p } = service(repo)

    await expect(
      projectService.createTask(context("viewer"), taskInput)
    ).rejects.toMatchObject({ code: "role_cannot_modify_projects" })

    expect(p.repository.createTaskInRepository).not.toHaveBeenCalled()
    expect(repo.createTask).not.toHaveBeenCalled()
  })

  it("refuses task moves for a viewer", async () => {
    const { projectService, ports: p } = service(repo)

    await expect(
      projectService.moveTask(context("viewer"), "task_1", { status: "done" })
    ).rejects.toBeInstanceOf(ForbiddenError)

    expect(p.repository.pushTaskStatus).not.toHaveBeenCalled()
    expect(repo.updateTask).not.toHaveBeenCalled()
  })

  it("does not create the task when the repository rejects access", async () => {
    const denied = new ForbiddenError("no repository access", {
      code: "repository_access_denied",
    })
    const { projectService } = service(
      repo,
      ports({
        repository: {
          createTaskInRepository: vi.fn(async () => {
            throw denied
          }),
          pushTaskStatus: vi.fn(async () => undefined),
          scheduleContentPush: vi.fn(),
          closeTaskIssue: vi.fn(async () => undefined),
        },
      })
    )

    await expect(
      projectService.createTask(context("member"), taskInput)
    ).rejects.toMatchObject({ code: "repository_access_denied" })

    expect(repo.createTask).not.toHaveBeenCalled()
    expect(repo.addActivity).not.toHaveBeenCalled()
  })

  it("creates a task for a member and notifies the assignee", async () => {
    const audit = vi.fn(async () => undefined)
    const notify = vi.fn(async () => undefined)
    const { projectService } = service(repo, ports({ audit, notify }))

    const task = await projectService.createTask(context("member"), {
      ...taskInput,
      assigneeId: "user_assignee",
    })

    expect(task.identifier).toBe("WEB-1")
    expect(repo.createTask).toHaveBeenCalledOnce()
    expect(repo.addActivity).toHaveBeenCalledWith({
      projectId: project.id,
      actorId: USER,
      action: "created",
      target: "W-1",
    })
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        userId: "user_assignee",
        actorId: USER,
        type: "task.assigned",
      })
    )
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, userId: USER }),
      expect.objectContaining({ action: "task.created" })
    )
  })

  it("keeps a task local when issue creation is opted out", async () => {
    const { projectService, ports: p } = service(repo)

    await projectService.createTask(context("member"), {
      ...taskInput,
      createIssue: false,
    })

    expect(p.repository.createTaskInRepository).not.toHaveBeenCalled()
    expect(repo.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ createIssue: false })
    )
  })

  it("refuses to read a task from another organization", async () => {
    repo.findTask.mockResolvedValueOnce(null)
    const { projectService } = service(repo)

    await expect(
      projectService.getTask(context("member"), "task_other")
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it("pushes a status change before committing it locally", async () => {
    const { projectService, ports: p } = service(repo)

    await projectService.moveTask(context("member"), "task_1", {
      status: "in_progress",
    })

    const push = vi.mocked(p.repository.pushTaskStatus).mock
      .invocationCallOrder[0]
    const update = repo.updateTask.mock.invocationCallOrder[0]
    expect(push).toBeLessThan(update!)
    expect(repo.addActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "moved",
        target: "WEB-1__STATUS__in_progress",
      })
    )
  })

  it("schedules a content push after a title edit", async () => {
    const { projectService, ports: p } = service(repo)

    await projectService.updateTask(context("member"), "task_1", {
      title: "Ship it today",
    })

    expect(p.repository.scheduleContentPush).toHaveBeenCalledWith(
      USER,
      "task_1"
    )
  })
})
