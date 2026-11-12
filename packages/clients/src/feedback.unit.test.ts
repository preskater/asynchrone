import { describe, expect, it, vi } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import { feedbackTrend, summarizeFeedback } from "./feedback-stats"
import type { ClientAuditEntry } from "./ports"
import type { ClientsRepository } from "./repository"
import { ClientFeedbackService, formatTestedAt } from "./services/feedback"
import type { ClientFeedbackData, ClientReleaseGroupData } from "./types"

const owner: RequestContext = {
  userId: "user_owner",
  userName: "Ada",
  userEmail: "ada@example.com",
  organizationId: "org_1",
  role: "owner",
}
const viewer: RequestContext = {
  ...owner,
  userId: "user_viewer",
  role: "viewer",
}
const member: RequestContext = {
  ...owner,
  userId: "user_member",
  role: "member",
}

const now = new Date("2026-11-12T10:00:00Z")

function release(overrides: Record<string, unknown> = {}) {
  return {
    id: "rel_1",
    organizationId: "org_1",
    clientId: "client_1",
    projectId: null,
    version: "1.4.2",
    label: null,
    releasedAt: null,
    status: "in_test",
    notes: null,
    portalVisible: false,
    createdBy: "user_owner",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function feedback(overrides: Record<string, unknown> = {}) {
  return {
    id: "fb_1",
    organizationId: "org_1",
    clientId: "client_1",
    releaseId: "rel_1",
    projectId: null,
    contactId: null,
    authorId: "user_owner",
    assigneeId: null,
    testedAt: now,
    environment: "staging",
    category: "bug",
    impact: "high",
    status: "new",
    statusChangedAt: now,
    title: "Login fails",
    body: "Blank page after sign-in",
    linkedTaskId: null,
    documentId: null,
    version: "1.4.2",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const directory = [
  {
    userId: "user_owner",
    name: "Ada",
    email: "a@x.test",
    role: "owner",
    clientId: null,
  },
  {
    userId: "user_portal",
    name: "Pat",
    email: "p@x.test",
    role: "client",
    clientId: "client_1",
  },
]

function setup(repo: Record<string, unknown> = {}) {
  const audit: ClientAuditEntry[] = []
  const fake = {
    listMembers: async () => directory.filter((m) => m.clientId == null),
    memberExists: async (_org: string, id: string) =>
      directory.find((m) => m.userId === id) ?? null,
    findClient: async (_org: string, id: string) =>
      id === "client_1" ? { id } : null,
    findContact: async () => null,
    contactNames: async () => [],
    findRelease: async (org: string, id: string) =>
      org === "org_1" && id === "rel_1" ? release() : null,
    findReleaseByVersion: async () => null,
    findFeedback: async (org: string, id: string) =>
      org === "org_1" && id === "fb_1" ? feedback() : null,
    releaseStats: async () => [],
    createRelease: vi.fn(async (data: Record<string, unknown>) =>
      release({ ...data, id: "rel_new" })
    ),
    createFeedback: vi.fn(async (data: Record<string, unknown>) =>
      feedback({ ...data, id: "fb_new" })
    ),
    updateFeedback: vi.fn(async (id: string, data: Record<string, unknown>) =>
      feedback({ ...data, id })
    ),
    findProject: async () => null,
    createAudit: async (entries: ClientAuditEntry[]) => {
      audit.push(...entries)
      return { count: entries.length }
    },
    ...repo,
  }
  const service = new ClientFeedbackService(
    fake as unknown as ClientsRepository
  )
  return { service, fake, audit }
}

const feedbackInput = {
  releaseId: "rel_1",
  testedAt: "2026-11-10T14:30:00+01:00",
  environment: "staging" as const,
  category: "bug" as const,
  impact: "high" as const,
  title: "Login fails",
  body: "Blank page after sign-in",
}

describe("ClientFeedbackService", () => {
  it("keeps viewers read-only", async () => {
    const { service } = setup()
    await expect(
      service.saveRelease(viewer, {
        clientId: "client_1",
        version: "1.5.0",
        status: "planned",
        portalVisible: false,
      })
    ).rejects.toMatchObject({ code: "role_cannot_modify_clients" })
    await expect(service.saveFeedback(viewer, feedbackInput)).rejects.toThrow()
  })

  it("rejects a version the client already has", async () => {
    const { service } = setup({
      findReleaseByVersion: async () => ({ id: "rel_other" }),
    })
    await expect(
      service.saveRelease(member, {
        clientId: "client_1",
        version: "1.4.2",
        status: "planned",
        portalVisible: false,
      })
    ).rejects.toMatchObject({ code: "release_version_taken" })
  })

  it("only links a project of the same client", async () => {
    const { service } = setup({
      findProject: async () => ({ id: "p_1", clientId: "client_2" }),
    })
    await expect(
      service.saveRelease(member, {
        clientId: "client_1",
        projectId: "p_1",
        version: "1.5.0",
        status: "planned",
        portalVisible: false,
      })
    ).rejects.toMatchObject({ code: "project_not_linked_to_client" })
  })

  it("does not reach a release of another organization", async () => {
    const { service } = setup()
    await expect(
      service.saveFeedback(
        { ...member, organizationId: "org_2" },
        feedbackInput
      )
    ).rejects.toMatchObject({ name: "NotFoundError" })
  })

  it("snapshots the release version and audits on the company", async () => {
    const { service, fake, audit } = setup()
    const saved = await service.saveFeedback(member, feedbackInput)
    expect(fake.createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client_1",
        version: "1.4.2",
        authorId: "user_member",
        testedAt: new Date("2026-11-10T13:30:00Z"),
      })
    )
    expect(saved.version).toBe("1.4.2")
    expect(audit).toEqual([
      expect.objectContaining({
        action: "client.feedback.created",
        entityType: "client",
        entityId: "client_1",
      }),
    ])
  })

  it("timestamps a status change and records it once", async () => {
    const { service, fake, audit } = setup()
    await service.setFeedbackStatus(member, { id: "fb_1", status: "fixed" })
    expect(fake.updateFeedback).toHaveBeenCalledWith("fb_1", {
      status: "fixed",
      statusChangedAt: expect.any(Date),
    })
    expect(audit[0]).toMatchObject({
      action: "client.feedback.status_changed",
      before: { status: "new" },
      after: { status: "fixed", version: "1.4.2" },
    })

    fake.updateFeedback.mockClear()
    await service.setFeedbackStatus(member, { id: "fb_1", status: "new" })
    expect(fake.updateFeedback).not.toHaveBeenCalled()
    expect(audit).toHaveLength(1)
  })

  it("never assigns a report to a portal account", async () => {
    const { service } = setup()
    await expect(
      service.assignFeedback(member, { id: "fb_1", assigneeId: "user_portal" })
    ).rejects.toMatchObject({ name: "NotFoundError" })
  })

  it("lets only admins delete", async () => {
    const { service } = setup()
    await expect(service.deleteRelease(member, "rel_1")).rejects.toMatchObject({
      code: "role_cannot_manage_clients",
    })
  })

  it("groups feedback under its release with the test range", async () => {
    const { service } = setup({
      listReleases: async () => [
        release(),
        release({ id: "rel_2", version: "1.5.0" }),
      ],
      listFeedback: async () => [feedback()],
      releaseStats: async () => [
        {
          releaseId: "rel_1",
          count: 3,
          open: 1,
          testedFrom: new Date("2026-11-01T09:00:00Z"),
          testedTo: now,
        },
      ],
    })
    const groups = await service.listReleaseGroups(viewer, {
      clientId: "client_1",
    })
    expect(groups.map((g) => [g.release.version, g.feedback.length])).toEqual([
      ["1.4.2", 1],
      ["1.5.0", 0],
    ])
    expect(groups[0]?.release).toMatchObject({
      feedbackCount: 3,
      openCount: 1,
      testedFrom: "2026-11-01T09:00:00.000Z",
    })
    expect(groups[0]?.feedback[0]?.authorName).toBe("Ada")
  })
})

describe("release report helpers", () => {
  const item = (status: string, category = "bug", impact = "high") =>
    ({ status, category, impact }) as unknown as ClientFeedbackData

  it("counts a report by status, category and impact", () => {
    const summary = summarizeFeedback([
      item("new"),
      item("fixed", "idea", "low"),
      item("triaged", "bug", "critical"),
    ])
    expect(summary).toMatchObject({
      total: 3,
      open: 2,
      byStatus: { new: 1, fixed: 1, triaged: 1 },
      byCategory: { bug: 2, idea: 1 },
      byImpact: { high: 1, low: 1, critical: 1 },
    })
  })

  it("prints test times in the viewer's zone, UTC otherwise", () => {
    const iso = "2026-11-10T10:30:00.000Z"
    expect(formatTestedAt(iso, "Indian/Reunion")).toBe("2026-11-10 14:30")
    expect(formatTestedAt(iso, "Not/AZone")).toBe("2026-11-10 10:30 UTC")
    expect(formatTestedAt(iso)).toBe("2026-11-10 10:30 UTC")
  })

  it("orders the trend by release date and skips empty versions", () => {
    const group = (
      version: string,
      releasedAt: string,
      statuses: string[]
    ) => ({
      release: { version, releasedAt, createdAt: releasedAt },
      feedback: statuses.map((status) => item(status)),
    })
    const groups = [
      group("1.5.0", "2026-12-01", ["new", "fixed", "fixed"]),
      group("1.6.0", "2026-12-15", []),
      group("1.4.2", "2026-11-05", ["new", "triaged", "rejected"]),
    ] as unknown as ClientReleaseGroupData[]
    expect(feedbackTrend(groups)).toEqual([
      { version: "1.4.2", open: 2, fixed: 0 },
      { version: "1.5.0", open: 1, fixed: 2 },
    ])
  })
})

describe("convert feedback to task", () => {
  const url = "https://clients.test/en/acme"

  it("needs a project on the release", async () => {
    const { service } = setup()
    await expect(
      service.convertFeedbackToTask(member, { id: "fb_1" }, url)
    ).rejects.toMatchObject({ code: "feedback_project_required" })
  })

  it("never creates a second task", async () => {
    const { service } = setup({
      findFeedback: async () => feedback({ linkedTaskId: "task_1" }),
    })
    await expect(
      service.convertFeedbackToTask(member, { id: "fb_1" }, url)
    ).rejects.toMatchObject({ code: "feedback_already_converted" })
  })

  it("creates the task once, links it and audits the company", async () => {
    const createProjectTask = vi.fn(async () => ({
      id: "task_9",
      identifier: "WEB-9",
      projectId: "p_1",
    }))
    const { service, fake, audit } = setup({
      findFeedback: async () =>
        feedback({
          projectId: "p_1",
          impact: "critical",
          assigneeId: "user_owner",
        }),
      findClient: async () => ({ id: "client_1", name: "Acme" }),
      createProjectTask,
    })
    await service.convertFeedbackToTask(member, { id: "fb_1" }, url)
    expect(createProjectTask).toHaveBeenCalledWith(
      member,
      expect.objectContaining({
        projectId: "p_1",
        title: "Login fails",
        priority: "urgent",
        assigneeId: "user_owner",
        description: expect.stringContaining(
          "https://clients.test/en/acme/clients/client_1/feedback"
        ),
      }),
      "client-feedback-task:fb_1"
    )
    expect(fake.updateFeedback).toHaveBeenCalledWith("fb_1", {
      linkedTaskId: "task_9",
    })
    expect(audit[0]).toMatchObject({
      action: "client.feedback.converted",
      entityId: "client_1",
      after: { taskIdentifier: "WEB-9" },
    })
  })
})
