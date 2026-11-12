import { PassThrough } from "node:stream"

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import type { PortalRepository } from "./repository"
import { MAX_PORTAL_UPLOAD_BYTES, PortalService } from "./service"
import type { PortalContext, PortalReleaseReportData } from "./types"

const ctxA: PortalContext = {
  userId: "user_client_a",
  userName: "Alice",
  userEmail: "alice@example.com",
  organizationId: "org_a",
  organizationName: "Agency",
  organizationSlug: "agency",
  clientId: "client_a",
  clientName: "Acme",
}

const ctxB: PortalContext = {
  ...ctxA,
  userId: "user_client_b",
  userName: "Mallory",
  organizationId: "org_b",
  organizationName: "Other",
  organizationSlug: "other",
  clientId: "client_b",
  clientName: "Globex",
}

const createdAt = new Date("2026-10-30T10:00:00Z")

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "project_a",
    name: "Website",
    description: "The new site",
    status: "active",
    dueDate: createdAt,
    createdAt,
    clientDiscussion: "read_write",
    clientTaskComments: "read",
    tasks: [
      { id: "task_a", title: "Design", status: "done", dueDate: createdAt },
      { id: "task_b", title: "Build", status: "todo", dueDate: null },
    ],
    ...overrides,
  }
}

function membership(role: RequestContext["role"]): RequestContext {
  return {
    userId: "user_staff",
    userName: "Sam",
    userEmail: "sam@example.com",
    organizationId: "org_a",
    role,
  }
}

function buildService() {
  const repo = {
    listDashboardProjects: vi.fn(async () => [projectRow()]),
    listUnreadMessages: vi.fn(async () => [
      { projectId: "project_a" },
      { projectId: "project_a" },
    ]),
    listClientDocuments: vi.fn(async () => [
      {
        id: "doc_a",
        fileId: "file_a",
        addedBy: "user_staff",
        file: { name: "brief.pdf", sizeBytes: 2048 },
        createdAt,
      },
    ]),
    findProject: vi.fn(async () => projectRow()),
    findProjectPolicy: vi.fn(async () =>
      projectRow({
        clientDiscussion: "read_write",
        clientTaskComments: "read_write",
      })
    ),
    findProjectTask: vi.fn(async () => ({
      id: "task_a",
      identifier: "PRJ-1",
      title: "Design",
      description: "Mockups",
      status: "done" as const,
      priority: "high" as const,
      dueDate: createdAt,
      endDate: null,
      createdAt,
      subtasks: [{ id: "sub_a", title: "Sketch", done: true }],
      labels: [{ label: { name: "design" } }],
    })),
    findTask: vi.fn(async () => ({ id: "task_a" })),
    createClientDocument: vi.fn(async () => ({
      id: "doc_new",
      createdAt,
    })),
    findClientDocumentLink: vi.fn(async () => ({
      file: {
        name: "brief.pdf",
        oid: 42n,
        mimeType: "application/pdf",
        trashed: false,
      },
    })),
    lastSeenAt: vi.fn(async () => ({
      portalLastSeenAt: new Date("2026-10-29T10:00:00Z"),
    })),
    markSeen: vi.fn(async () => ({ count: 1 })),
    findClient: vi.fn(async () => ({ ownerId: "user_owner", name: "Acme" })),
    listClientAdmins: vi.fn(async () => [{ userId: "user_admin" }]),
    listUserNames: vi.fn(async () => [{ id: "user_staff", name: "Sam" }]),
    listAccessMembers: vi.fn(async () => [
      {
        id: "member_client",
        createdAt,
        user: {
          id: "user_client_a",
          name: "Alice",
          email: "alice@example.com",
        },
      },
    ]),
    listPendingInvites: vi.fn(async () => [
      {
        id: "invite_a",
        email: "bob@example.com",
        name: null,
        createdAt,
        invitationId: "ba_invite_a",
      },
    ]),
    findClientInOrganization: vi.fn(async () => ({ id: "client_a" })),
    findMemberByEmail: vi.fn(async () => null),
    findPendingInvite: vi.fn(async () => null),
    createInvite: vi.fn(async () => ({
      id: "invite_new",
      email: "bob@example.com",
    })),
    findAccessMember: vi.fn(async () => ({ id: "member_client" })),
    deleteMember: vi.fn(async () => ({ id: "member_client" })),
    findInvite: vi.fn(async () => ({
      id: "invite_a",
      invitationId: "ba_invite_a",
    })),
    deleteInvite: vi.fn(async () => ({ id: "invite_a" })),
    findClaimInvite: vi.fn(async () => ({
      id: "invite_a",
      organizationId: "org_a",
      clientId: "client_a",
      email: "alice@example.com",
    })),
    findMemberForUser: vi.fn(async () => ({
      id: "member_client",
      clientId: null,
    })),
    updateMemberClient: vi.fn(async () => ({ id: "member_client" })),
    markInviteAccepted: vi.fn(async () => ({ id: "invite_a" })),
  }

  const projects = {
    listProjects: vi.fn(async () => [
      {
        id: "project_a",
        name: "Website",
        status: "active",
        dueDate: createdAt.toISOString(),
        doneTasks: 1,
        totalTasks: 2,
      },
    ]),
    listUnreadMessages: vi.fn(async () => [
      { projectId: "project_a" },
      { projectId: "project_a" },
    ]),
    findProject: vi.fn(async () => ({
      id: "project_a",
      name: "Website",
      description: "The new site",
      status: "active",
      dueDate: createdAt.toISOString(),
      createdAt: createdAt.toISOString(),
      tasks: [
        {
          id: "task_a",
          title: "Design",
          status: "done",
          dueDate: createdAt.toISOString(),
        },
        { id: "task_b", title: "Build", status: "todo" },
      ],
      discussionPolicy: "read_write" as const,
      taskCommentsPolicy: "read" as const,
    })),
    findProjectPolicy: vi.fn(async () => ({
      clientDiscussion: "read_write" as const,
      clientTaskComments: "read_write" as const,
    })),
    findProjectTask: vi.fn(async () => ({
      id: "task_a",
      identifier: "PRJ-1",
      title: "Design",
      description: "Mockups",
      status: "done" as const,
      priority: "high" as const,
      dueDate: createdAt.toISOString(),
      createdAt: createdAt.toISOString(),
      labels: ["design"],
      subtasks: [{ id: "sub_a", title: "Sketch", done: true }],
    })),
    findTask: vi.fn(async () => ({ id: "task_a" })),
  }
  const clientDocuments = {
    listDocuments: vi.fn(async () => [
      {
        id: "doc_a",
        fileId: "file_a",
        name: "brief.pdf",
        sizeBytes: 2048,
        createdAt: createdAt.toISOString(),
        addedByName: "Sam",
      },
    ]),
    findDocumentLink: vi.fn(async () => ({
      name: "brief.pdf",
      mimeType: "application/pdf",
      trashed: false,
    })),
    createDocument: vi.fn(async () => ({
      id: "doc_new",
      createdAt: createdAt.toISOString(),
    })),
    findClient: vi.fn(async () => ({ ownerId: "user_owner", name: "Acme" })),
    findClientInOrganization: vi.fn(async () => ({ id: "client_a" })),
    listReleaseReports: vi.fn(async () => []),
    getReleaseReport: vi.fn(
      async (_org: string, _client: string, _release: string) =>
        null as PortalReleaseReportData | null
    ),
  }

  const files = {
    createUploadedFile: vi.fn(async () => ({ id: "file_new" })),
    openDocument: vi.fn(async () => ({
      name: "brief.pdf",
      mimeType: "application/pdf",
      size: 2048,
      stream: new PassThrough(),
    })),
    quotaBytes: vi.fn(async () => 1_000_000),
    usedBytes: vi.fn(async () => 0),
  }
  const collaboration = {
    listMessages: vi.fn(async () => []),
    createMessage: vi.fn(async () => ({
      id: "message_a",
      body: "hello",
      authorId: "user_client_a",
      authorKind: "client" as const,
      authorName: "Alice",
      createdAt: createdAt.toISOString(),
    })),
    listTaskComments: vi.fn(async () => [
      {
        id: "comment_a",
        authorId: "user_staff",
        authorKind: "internal" as const,
        authorName: "Sam",
        body: "Looks good",
        createdAt: createdAt.toISOString(),
      },
    ]),
    createTaskComment: vi.fn(async () => ({
      id: "comment_b",
      authorId: "user_client_a",
      authorKind: "client" as const,
      authorName: "Alice",
      body: "Thanks",
      createdAt: createdAt.toISOString(),
    })),
  }
  const meetings = {
    getPortalMeetings: vi.fn(async () => ({
      settings: {} as never,
      requests: [],
    })),
  }
  const invitations = {
    create: vi.fn(async () => ({ id: "ba_invite_new" })),
    cancel: vi.fn(async () => undefined),
    currentUser: vi.fn(async () => ({
      id: "user_client_a",
      email: "alice@example.com",
    })),
  }
  const notify = vi.fn(async () => undefined)

  const service = new PortalService({
    repository: repo as unknown as PortalRepository,
    projects,
    clientDocuments,
    files,
    collaboration,
    meetings,
    invitations,
    notify,
  })

  return {
    service,
    repo,
    projects,
    clientDocuments,
    files,
    collaboration,
    meetings,
    invitations,
    notify,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PortalService client-member scope", () => {
  it("reads the dashboard of the caller's own company only", async () => {
    const { service, projects, clientDocuments } = buildService()

    const data = await service.getDashboard(ctxA)

    expect(projects.listProjects).toHaveBeenCalledWith("org_a", "client_a")
    expect(clientDocuments.listDocuments).toHaveBeenCalledWith(
      "org_a",
      "client_a"
    )
    expect(projects.listUnreadMessages).toHaveBeenCalledWith(
      "org_a",
      "client_a",
      ["project_a"],
      "user_client_a",
      expect.any(Date)
    )
    expect(data.projects[0]).toMatchObject({
      id: "project_a",
      doneTasks: 1,
      totalTasks: 2,
      unreadCount: 2,
    })
    expect(data.documents[0]).toMatchObject({
      fileId: "file_a",
      name: "brief.pdf",
      sizeBytes: 2048,
    })
  })

  it("returns not found when a project belongs to another organization", async () => {
    const { service, projects } = buildService()
    projects.findProject.mockResolvedValueOnce(null as never)

    await expect(service.getProject(ctxB, "project_a")).rejects.toMatchObject({
      message: expect.stringContaining("Project"),
    })
    expect(projects.findProject).toHaveBeenCalledWith(
      "org_b",
      "client_b",
      "project_a"
    )
  })

  it("refuses to post into a project of another organization", async () => {
    const { service, projects, collaboration } = buildService()
    projects.findProjectPolicy.mockResolvedValueOnce(null as never)

    await expect(
      service.postMessage(ctxB, "project_a", "hi")
    ).rejects.toMatchObject({
      message: expect.stringContaining("Project"),
    })
    expect(collaboration.createMessage).not.toHaveBeenCalled()
  })

  it("refuses to post when the project discussion is read-only", async () => {
    const { service, projects, collaboration } = buildService()
    projects.findProjectPolicy.mockResolvedValueOnce({
      clientDiscussion: "read",
      clientTaskComments: "read_write",
    } as never)

    await expect(
      service.postMessage(ctxA, "project_a", "hi")
    ).rejects.toMatchObject({ code: "portal_read_only" })
    expect(collaboration.createMessage).not.toHaveBeenCalled()
  })

  it("does not expose task comments when the project hides them", async () => {
    const { service, projects, collaboration } = buildService()
    projects.findProjectPolicy.mockResolvedValueOnce({
      clientDiscussion: "read_write",
      clientTaskComments: "none",
    } as never)

    const detail = await service.getTaskDetail(ctxA, "project_a", "task_a")

    expect(detail.comments).toEqual([])
    expect(collaboration.listTaskComments).not.toHaveBeenCalled()
  })

  it("refuses task comments written for another organization", async () => {
    const { service, projects, collaboration } = buildService()
    projects.findProjectPolicy.mockResolvedValueOnce(null as never)

    await expect(
      service.postTaskComment(ctxB, "project_a", "task_a", "hi")
    ).rejects.toMatchObject({ message: expect.stringContaining("Project") })
    expect(collaboration.createTaskComment).not.toHaveBeenCalled()
  })
})

describe("PortalService access management", () => {
  it("hides the portal access list from portal and viewer accounts", async () => {
    const { service } = buildService()

    await expect(
      service.listAccess(membership("client"), "client_a")
    ).rejects.toMatchObject({ code: "role_cannot_manage_members" })
    await expect(
      service.listAccess(membership("viewer"), "client_a")
    ).rejects.toMatchObject({ code: "role_cannot_manage_members" })
  })

  it("lists portal users and pending invitations for an internal member", async () => {
    const { service } = buildService()

    const access = await service.listAccess(membership("member"), "client_a")

    expect(access.members).toHaveLength(1)
    expect(access.invites[0]).toMatchObject({
      id: "invite_a",
      invitationId: "ba_invite_a",
    })
  })

  it("forbids portal accounts from inviting or revoking portal access", async () => {
    const { service, invitations, repo } = buildService()

    await expect(
      service.invite(membership("client"), {
        clientId: "client_a",
        email: "bob@example.com",
      })
    ).rejects.toMatchObject({ code: "role_cannot_manage_members" })
    await expect(
      service.revokeMember(membership("client"), "member_client")
    ).rejects.toMatchObject({ code: "role_cannot_manage_members" })
    expect(invitations.create).not.toHaveBeenCalled()
    expect(repo.deleteMember).not.toHaveBeenCalled()
  })

  it("lets an admin invite a contact and records the Better Auth invitation", async () => {
    const { service, invitations, repo } = buildService()

    const result = await service.invite(membership("admin"), {
      clientId: "client_a",
      email: "Bob@Example.com",
    })

    expect(invitations.create).toHaveBeenCalledWith("org_a", "bob@example.com")
    expect(repo.createInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_a",
        clientId: "client_a",
        email: "bob@example.com",
        invitationId: "ba_invite_new",
      })
    )
    expect(result.invite).toMatchObject({
      id: "invite_new",
      invitationId: "ba_invite_new",
    })
  })

  it("does not invite an email that is already a member", async () => {
    const { service, repo, invitations } = buildService()
    repo.findMemberByEmail.mockResolvedValueOnce({ id: "member" } as never)

    await expect(
      service.invite(membership("owner"), {
        clientId: "client_a",
        email: "bob@example.com",
      })
    ).rejects.toMatchObject({ code: "email_already_member" })
    expect(invitations.create).not.toHaveBeenCalled()
  })

  it("only revokes client-linked members of the same organization", async () => {
    const { service, repo } = buildService()
    repo.findAccessMember.mockResolvedValueOnce(null as never)

    await expect(
      service.revokeMember(membership("admin"), "member_internal")
    ).rejects.toMatchObject({ message: expect.stringContaining("Member") })
    expect(repo.deleteMember).not.toHaveBeenCalled()
  })

  it("claims an invitation for its own email and links the member to the company", async () => {
    const { service, repo } = buildService()

    await expect(service.claim("ba_invite_a")).resolves.toEqual({
      portal: true,
    })

    expect(repo.updateMemberClient).toHaveBeenCalledWith(
      "member_client",
      "client_a"
    )
    expect(repo.markInviteAccepted).toHaveBeenCalledWith("invite_a")
  })

  it("ignores an invitation issued to another email", async () => {
    const { service, repo } = buildService()
    repo.findClaimInvite.mockResolvedValueOnce({
      id: "invite_a",
      organizationId: "org_a",
      clientId: "client_a",
      email: "someone-else@example.com",
    } as never)

    await expect(service.claim("ba_invite_a")).resolves.toEqual({
      portal: false,
    })
    expect(repo.updateMemberClient).not.toHaveBeenCalled()
  })
})

describe("PortalService documents", () => {
  it("opens only documents linked to the caller's client company", async () => {
    const { service, clientDocuments, files } = buildService()

    const file = await service.openDocument(ctxA, "file_a")

    expect(clientDocuments.findDocumentLink).toHaveBeenCalledWith(
      "org_a",
      "client_a",
      "file_a"
    )
    expect(files.openDocument).toHaveBeenCalledWith("org_a", "file_a", {
      name: "brief.pdf",
      mimeType: "application/pdf",
    })
    expect(file).toMatchObject({
      name: "brief.pdf",
      mimeType: "application/pdf",
      size: 2048,
    })
  })

  it("does not open a document shared with another company", async () => {
    const { service, clientDocuments, files } = buildService()
    clientDocuments.findDocumentLink.mockResolvedValueOnce(null as never)

    await expect(service.openDocument(ctxB, "file_a")).rejects.toMatchObject({
      message: expect.stringContaining("Document"),
    })
    expect(files.openDocument).not.toHaveBeenCalled()
  })

  it("does not open a trashed file or a missing large object", async () => {
    const { service, clientDocuments, files } = buildService()
    clientDocuments.findDocumentLink.mockResolvedValueOnce({
      name: "brief.pdf",
      mimeType: "application/pdf",
      trashed: true,
    })

    await expect(service.openDocument(ctxA, "file_a")).rejects.toMatchObject({
      message: expect.stringContaining("Document"),
    })
    expect(files.openDocument).not.toHaveBeenCalled()
  })

  it("uploads a document into the files tree, links it to the client and notifies the team", async () => {
    const { service, clientDocuments, files, notify } = buildService()

    const document = await service.uploadDocument(ctxA, {
      name: "photo.png",
      mimeType: "image/png",
      sizeBytes: 11,
      stream: new PassThrough(),
    })

    expect(files.createUploadedFile).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_a",
        userId: "user_client_a",
        role: "client",
      }),
      expect.objectContaining({
        name: "photo.png",
        sizeBytes: 11,
        stream: expect.anything(),
      })
    )
    expect(clientDocuments.createDocument).toHaveBeenCalledWith({
      organizationId: "org_a",
      fileId: "file_new",
      clientId: "client_a",
      name: "photo.png",
      sizeBytes: 11,
      addedBy: "user_client_a",
      addedByName: "Alice",
      addedByEmail: "alice@example.com",
    })
    expect(notify).toHaveBeenCalledTimes(2)
    expect(document).toMatchObject({
      id: "doc_new",
      fileId: "file_new",
      name: "photo.png",
      sizeBytes: 11,
      addedByName: "Alice",
      isNew: true,
    })
  })

  it("rejects an empty or oversized upload before touching storage", async () => {
    const { service, files } = buildService()

    await expect(
      service.uploadDocument(ctxA, {
        name: "empty.txt",
        sizeBytes: 0,
        stream: new PassThrough(),
      })
    ).rejects.toMatchObject({ message: expect.stringContaining("empty") })

    await expect(
      service.uploadDocument(ctxA, {
        name: "huge.bin",
        sizeBytes: MAX_PORTAL_UPLOAD_BYTES + 1,
        stream: new PassThrough(),
      })
    ).rejects.toMatchObject({ code: "file_too_large" })

    expect(files.createUploadedFile).not.toHaveBeenCalled()
  })

  it("refuses an upload when the workspace storage quota is full", async () => {
    const { service, files } = buildService()
    files.usedBytes.mockResolvedValueOnce(1_000_000)

    await expect(
      service.uploadDocument(ctxA, {
        name: "photo.png",
        sizeBytes: 11,
        stream: new PassThrough(),
      })
    ).rejects.toMatchObject({ code: "storage_quota_exceeded" })
    expect(files.createUploadedFile).not.toHaveBeenCalled()
  })
})

describe("PortalService release reports", () => {
  it("asks for the caller's own company and hides anything not shared", async () => {
    const { service, clientDocuments } = buildService()
    await expect(
      service.getReleaseReport(ctxA, "rel_other")
    ).rejects.toMatchObject({
      name: "NotFoundError",
    })
    expect(clientDocuments.getReleaseReport).toHaveBeenCalledWith(
      ctxA.organizationId,
      ctxA.clientId,
      "rel_other"
    )
  })
})
