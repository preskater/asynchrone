import { headers } from "next/headers"
import type { Readable } from "node:stream"

import { AUDIT_ACTIONS } from "@/lib/audit/actions"
import { recordUserAudit } from "@/lib/audit/record"
import { auth } from "@/lib/auth"
import type { RequestContext } from "@workspace/core/context"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@workspace/core/errors"
import { fileService } from "@/lib/files"
import { orgQuotaBytes, orgUsedBytes } from "@/lib/files/storage"
import { MaxBytesExceededError, uploadLargeObject } from "@/lib/large-object"
import { notificationService } from "@/lib/notifications"
import { roleRank } from "@workspace/organization/roles"
import { prisma } from "@/lib/prisma"
import {
  createProjectMessage,
  listProjectMessages,
  type ProjectMessageData,
} from "@/lib/projects/thread"
import {
  createTaskComment,
  listTaskComments,
  type TaskCommentData,
} from "@/lib/projects/task-comments"
import type {
  PortalPolicy,
  TaskPriority,
  TaskStatus,
} from "@/lib/projects/types"

import type { PortalContext } from "./context"
import type { InvitePortalUserInput } from "./schemas"
import type {
  PortalAccessData,
  PortalDashboardData,
  PortalDocumentData,
  PortalProjectDetailData,
  PortalTaskDetailData,
} from "./types"

/** Direct uploads from the portal are capped to keep the single request sane. */
export const MAX_PORTAL_UPLOAD_BYTES = 25 * 1024 * 1024

function requirePortalManager(ctx: RequestContext) {
  if (roleRank(ctx.role) >= 3) return
  throw new ForbiddenError("Your role cannot manage portal access.", {
    code: "role_cannot_manage_members",
  })
}

function requireInternalMember(ctx: RequestContext) {
  if (roleRank(ctx.role) >= 2) return
  throw new ForbiddenError("Your role cannot view portal access.", {
    code: "role_cannot_manage_members",
  })
}

function iso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined
}

export class PortalService {
  // ---------------------------------------------------------------------------
  // Client-facing reads
  // ---------------------------------------------------------------------------

  /** Dashboard of the signed-in client: their projects and shared documents. */
  async getDashboard(ctx: PortalContext): Promise<PortalDashboardData> {
    const lastSeen = await this.lastSeenAt(ctx)
    const [projects, links] = await Promise.all([
      prisma.project.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId: ctx.clientId,
          clientVisible: true,
        },
        select: {
          id: true,
          name: true,
          status: true,
          dueDate: true,
          tasks: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.clientDocument.findMany({
        where: {
          organizationId: ctx.organizationId,
          entity: "client",
          entityId: ctx.clientId,
          visibility: "client",
          file: { trashed: false },
        },
        select: {
          id: true,
          fileId: true,
          file: { select: { name: true, sizeBytes: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ])

    // Unread messages per project: anything the client has not seen yet,
    // excluding their own posts.
    const projectIds = projects.map((project) => project.id)
    const unreadByProject = new Map<string, number>()
    if (projectIds.length > 0) {
      const messages = await prisma.projectMessage.findMany({
        where: {
          organizationId: ctx.organizationId,
          projectId: { in: projectIds },
          authorId: { not: ctx.userId },
          ...(lastSeen ? { createdAt: { gt: lastSeen } } : {}),
        },
        select: { projectId: true },
      })
      for (const message of messages) {
        unreadByProject.set(
          message.projectId,
          (unreadByProject.get(message.projectId) ?? 0) + 1
        )
      }
    }

    const data: PortalDashboardData = {
      organizationName: ctx.organizationName,
      clientName: ctx.clientName,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        dueDate: iso(project.dueDate),
        doneTasks: project.tasks.filter((task) => task.status === "done")
          .length,
        totalTasks: project.tasks.length,
        unreadCount: unreadByProject.get(project.id) ?? 0,
      })),
      documents: links.map((link) => ({
        id: link.id,
        fileId: link.fileId,
        name: link.file.name,
        sizeBytes: link.file.sizeBytes
          ? Number(link.file.sizeBytes)
          : undefined,
        createdAt: link.createdAt.toISOString(),
        isNew: lastSeen ? link.createdAt.getTime() > lastSeen.getTime() : true,
      })),
    }

    return data
  }

  /** One project of the client's company. Anything else is not found. */
  async getProject(
    ctx: PortalContext,
    projectId: string
  ): Promise<PortalProjectDetailData> {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: ctx.organizationId,
        clientId: ctx.clientId,
        clientVisible: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        dueDate: true,
        createdAt: true,
        clientDiscussion: true,
        clientTaskComments: true,
        tasks: {
          select: { id: true, title: true, status: true, dueDate: true },
          orderBy: { order: "asc" },
        },
      },
    })

    if (!project) throw new NotFoundError("Project")

    return {
      id: project.id,
      name: project.name,
      description: project.description ?? undefined,
      status: project.status,
      dueDate: iso(project.dueDate),
      createdAt: project.createdAt.toISOString(),
      tasks: project.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: iso(task.dueDate),
      })),
      discussionPolicy: project.clientDiscussion as PortalPolicy,
      taskCommentsPolicy: project.clientTaskComments as PortalPolicy,
    }
  }

  // ---------------------------------------------------------------------------
  // Client collaboration
  // ---------------------------------------------------------------------------

  /** The shared project thread of one of the client's projects. */
  async listMessages(
    ctx: PortalContext,
    projectId: string
  ): Promise<ProjectMessageData[]> {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: ctx.organizationId,
        clientId: ctx.clientId,
        clientVisible: true,
      },
      select: { id: true, clientDiscussion: true },
    })
    if (!project) throw new NotFoundError("Project")
    if (project.clientDiscussion === "none") return []
    return listProjectMessages(ctx.organizationId, projectId)
  }

  /** Post a message as the client; the team gets an in-app notification. */
  async postMessage(
    ctx: PortalContext,
    projectId: string,
    body: string
  ): Promise<ProjectMessageData> {
    const text = body.trim()
    if (!text) throw new ValidationError("The message is empty.")
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: ctx.organizationId,
        clientId: ctx.clientId,
        clientVisible: true,
      },
      select: { id: true, clientDiscussion: true },
    })
    if (!project) throw new NotFoundError("Project")
    if (project.clientDiscussion !== "read_write") {
      throw new ForbiddenError("The discussion is read-only for this client.", {
        code: "portal_read_only",
      })
    }
    return createProjectMessage({
      organizationId: ctx.organizationId,
      projectId,
      authorId: ctx.userId,
      authorKind: "client",
      body: text,
    })
  }

  /** One task of a client project, read-only, with its comments. */
  async getTaskDetail(
    ctx: PortalContext,
    projectId: string,
    taskId: string
  ): Promise<{
    task: PortalTaskDetailData
    comments: TaskCommentData[]
    commentsPolicy: PortalPolicy
  }> {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: ctx.organizationId,
        clientId: ctx.clientId,
        clientVisible: true,
      },
      select: { id: true, clientTaskComments: true },
    })
    if (!project) throw new NotFoundError("Project")

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        projectId,
        organizationId: ctx.organizationId,
      },
      select: {
        id: true,
        identifier: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        endDate: true,
        createdAt: true,
        subtasks: {
          select: { id: true, title: true, done: true },
          orderBy: { order: "asc" },
        },
        labels: { include: { label: { select: { name: true } } } },
      },
    })
    if (!task) throw new NotFoundError("Task")

    const policy = project.clientTaskComments as PortalPolicy
    const comments =
      policy === "none"
        ? []
        : await listTaskComments(ctx.organizationId, taskId)

    return {
      task: {
        id: task.id,
        identifier: task.identifier,
        title: task.title,
        description: task.description ?? undefined,
        status: task.status as TaskStatus,
        priority: task.priority as TaskPriority,
        dueDate: iso(task.dueDate),
        endDate: iso(task.endDate),
        createdAt: task.createdAt.toISOString(),
        labels: task.labels.map((entry) => entry.label.name),
        subtasks: task.subtasks.map((subtask) => ({
          id: subtask.id,
          title: subtask.title,
          done: subtask.done,
        })),
      },
      comments,
      commentsPolicy: policy,
    }
  }

  /** Add a comment to a task as the client (if the policy allows it). */
  async postTaskComment(
    ctx: PortalContext,
    projectId: string,
    taskId: string,
    body: string
  ): Promise<TaskCommentData> {
    const text = body.trim()
    if (!text) throw new ValidationError("The comment is empty.")
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: ctx.organizationId,
        clientId: ctx.clientId,
        clientVisible: true,
      },
      select: { id: true, clientTaskComments: true },
    })
    if (!project) throw new NotFoundError("Project")
    if (project.clientTaskComments !== "read_write") {
      throw new ForbiddenError("Task comments are read-only for this client.", {
        code: "portal_read_only",
      })
    }
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId, organizationId: ctx.organizationId },
      select: { id: true },
    })
    if (!task) throw new NotFoundError("Task")
    return createTaskComment({
      organizationId: ctx.organizationId,
      taskId,
      authorId: ctx.userId,
      authorKind: "client",
      authorName: ctx.userName,
      body: text,
    })
  }

  /** All documents shared with the client's company. */
  async getDocuments(ctx: PortalContext): Promise<PortalDocumentData[]> {
    const links = await prisma.clientDocument.findMany({
      where: {
        organizationId: ctx.organizationId,
        entity: "client",
        entityId: ctx.clientId,
        visibility: "client",
        file: { trashed: false },
      },
      select: {
        id: true,
        fileId: true,
        addedBy: true,
        file: { select: { name: true, sizeBytes: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    })

    const nameById = new Map<string, string>()
    const addedByIds = [...new Set(links.map((link) => link.addedBy))]
    if (addedByIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: addedByIds } },
        select: { id: true, name: true },
      })
      for (const user of users) nameById.set(user.id, user.name)
    }

    return links.map((link) => ({
      id: link.id,
      fileId: link.fileId,
      name: link.file.name,
      sizeBytes: link.file.sizeBytes ? Number(link.file.sizeBytes) : undefined,
      createdAt: link.createdAt.toISOString(),
      addedByName: nameById.get(link.addedBy),
    }))
  }

  /**
   * Upload a document from the portal: stored in the workspace files, linked
   * to the client's company as a client-visible document (so both the team
   * and the client see it) and announced to the client owner and admins.
   */
  async uploadDocument(
    ctx: PortalContext,
    input: {
      name: string
      mimeType?: string
      sizeBytes: number
      stream: Readable
    }
  ): Promise<PortalDocumentData> {
    if (input.sizeBytes <= 0) {
      throw new ValidationError("The file is empty.")
    }
    if (input.sizeBytes > MAX_PORTAL_UPLOAD_BYTES) {
      throw new ValidationError("The file is too large.", undefined, {
        code: "file_too_large",
        params: { max: String(MAX_PORTAL_UPLOAD_BYTES / (1024 * 1024)) },
      })
    }

    const [quota, used] = await Promise.all([
      orgQuotaBytes(ctx.organizationId),
      orgUsedBytes(ctx.organizationId),
    ])
    if (used + input.sizeBytes > quota) {
      throw new ConflictError("The workspace is out of storage.", {
        code: "storage_quota_exceeded",
      })
    }

    let uploaded
    try {
      uploaded = await uploadLargeObject(input.stream, {
        maxBytes: MAX_PORTAL_UPLOAD_BYTES,
      })
    } catch (error) {
      if (error instanceof MaxBytesExceededError) {
        throw new ValidationError("The file is too large.", undefined, {
          code: "file_too_large",
          params: { max: String(MAX_PORTAL_UPLOAD_BYTES / (1024 * 1024)) },
        })
      }
      throw error
    }

    const fileCtx: RequestContext = {
      userId: ctx.userId,
      userName: ctx.userName,
      userEmail: ctx.userEmail,
      organizationId: ctx.organizationId,
      role: "client",
    }
    const file = await fileService.createUploadedFile(fileCtx, {
      name: input.name,
      parentId: null,
      sizeBytes: uploaded.size,
      mimeType: input.mimeType,
      oid: uploaded.oid,
      sha256: uploaded.sha256,
    })

    const link = await prisma.clientDocument.create({
      data: {
        organizationId: ctx.organizationId,
        fileId: file.id,
        entity: "client",
        entityId: ctx.clientId,
        visibility: "client",
        addedBy: ctx.userId,
      },
      select: { id: true, createdAt: true },
    })

    // Surface the upload on the company timeline like an internal link would.
    await recordUserAudit(ctx, {
      action: AUDIT_ACTIONS.clientDocumentLinked,
      entityType: "client",
      entityId: ctx.clientId,
      entityLabel: ctx.clientName,
      after: { fileName: input.name },
    })

    await this.notifyTeamOfClientDocument(ctx, input.name)

    return {
      id: link.id,
      fileId: file.id,
      name: input.name,
      sizeBytes: uploaded.size,
      createdAt: link.createdAt.toISOString(),
      addedByName: ctx.userName,
      isNew: true,
    }
  }

  /** The company owner and the workspace admins hear about client uploads. */
  private async notifyTeamOfClientDocument(
    ctx: PortalContext,
    fileName: string
  ): Promise<void> {
    const [client, admins] = await Promise.all([
      prisma.client.findUnique({
        where: { id: ctx.clientId },
        select: { ownerId: true, name: true },
      }),
      prisma.member.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId: null,
          role: { in: ["owner", "admin"] },
        },
        select: { userId: true },
      }),
    ])

    const recipients = new Set<string>()
    if (client?.ownerId) recipients.add(client.ownerId)
    for (const admin of admins) recipients.add(admin.userId)

    await Promise.all(
      [...recipients].map((userId) =>
        notificationService.notify({
          organizationId: ctx.organizationId,
          userId,
          actorId: ctx.userId,
          type: "portal.document",
          data: {
            clientId: ctx.clientId,
            clientName: client?.name ?? ctx.clientName,
            fileName,
            actorName: ctx.userName,
          },
        })
      )
    )
  }

  private async lastSeenAt(ctx: PortalContext): Promise<Date | null> {
    const member = await prisma.member.findFirst({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
      select: { portalLastSeenAt: true },
    })
    return member?.portalLastSeenAt ?? null
  }

  /**
   * Called from the client after the portal paints: anything rendered as new
   * stays new for this visit and only clears on the next one.
   */
  async markSeen(ctx: PortalContext): Promise<void> {
    await prisma.member.updateMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
      data: { portalLastSeenAt: new Date() },
    })
  }

  // ---------------------------------------------------------------------------
  // Access management (internal client side)
  // ---------------------------------------------------------------------------

  /** Portal users and pending invitations of a company. */
  async listAccess(
    ctx: RequestContext,
    clientId: string
  ): Promise<PortalAccessData> {
    requireInternalMember(ctx)
    const [members, invites] = await Promise.all([
      prisma.member.findMany({
        where: { organizationId: ctx.organizationId, clientId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.portalInvite.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          acceptedAt: null,
        },
        orderBy: { createdAt: "desc" },
      }),
    ])

    return {
      members: members.map((member) => ({
        memberId: member.id,
        userId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        createdAt: member.createdAt.toISOString(),
      })),
      invites: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        name: invite.name ?? undefined,
        createdAt: invite.createdAt.toISOString(),
        invitationId: invite.invitationId ?? undefined,
      })),
    }
  }

  /** Invite a company contact to the portal and return the invitation link. */
  async invite(
    ctx: RequestContext,
    input: InvitePortalUserInput
  ): Promise<{ invite: { id: string; email: string; invitationId?: string } }> {
    requirePortalManager(ctx)

    const client = await prisma.client.findFirst({
      where: { id: input.clientId, organizationId: ctx.organizationId },
      select: { id: true },
    })
    if (!client) throw new NotFoundError("Client")

    const email = input.email.toLowerCase()
    const existingMember = await prisma.member.findFirst({
      where: { organizationId: ctx.organizationId, user: { email } },
      select: { id: true },
    })
    if (existingMember) {
      throw new ConflictError("That email is already a member.", {
        code: "email_already_member",
      })
    }
    const existingInvite = await prisma.portalInvite.findFirst({
      where: {
        organizationId: ctx.organizationId,
        clientId: input.clientId,
        email,
        acceptedAt: null,
      },
      select: { id: true },
    })
    if (existingInvite) {
      throw new ConflictError(
        "That email already has a pending portal invitation.",
        { code: "portal_invite_exists" }
      )
    }

    const invitation = await auth.api.createInvitation({
      headers: await headers(),
      body: {
        organizationId: ctx.organizationId,
        email,
        role: "client",
      },
    })

    const row = await prisma.portalInvite.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: input.clientId,
        email,
        name: input.name || null,
        invitationId: invitation.id,
        invitedById: ctx.userId,
      },
    })

    return {
      invite: { id: row.id, email: row.email, invitationId: invitation.id },
    }
  }

  /** Revoke portal access: removes the organization member entirely. */
  async revokeMember(
    ctx: RequestContext,
    memberId: string
  ): Promise<{ id: string }> {
    requirePortalManager(ctx)
    const member = await prisma.member.findFirst({
      where: {
        id: memberId,
        organizationId: ctx.organizationId,
        clientId: { not: null },
      },
      select: { id: true },
    })
    if (!member) throw new NotFoundError("Member")
    await prisma.member.delete({ where: { id: memberId } })
    return { id: memberId }
  }

  /** Cancel a pending portal invitation (revokes the better-auth invitation). */
  async cancelInvite(
    ctx: RequestContext,
    inviteId: string
  ): Promise<{ id: string }> {
    requirePortalManager(ctx)
    const invite = await prisma.portalInvite.findFirst({
      where: { id: inviteId, organizationId: ctx.organizationId },
      select: { id: true, invitationId: true },
    })
    if (!invite) throw new NotFoundError("Invitation")
    if (invite.invitationId) {
      try {
        await auth.api.cancelInvitation({
          headers: await headers(),
          body: { invitationId: invite.invitationId },
        })
      } catch {
        // The invitation may already be accepted, expired or cancelled.
      }
    }
    await prisma.portalInvite.delete({ where: { id: inviteId } })
    return { id: inviteId }
  }

  /**
   * Called right after a client accepts their invitation: links the fresh
   * member row to the invited company and returns whether it was a portal
   * invitation.
   */
  async claim(invitationId: string): Promise<{ portal: boolean }> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) throw new UnauthorizedError()

    const invite = await prisma.portalInvite.findFirst({
      where: { invitationId, acceptedAt: null },
      select: { id: true, organizationId: true, clientId: true, email: true },
    })
    if (!invite) return { portal: false }
    if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return { portal: false }
    }

    const member = await prisma.member.findFirst({
      where: {
        organizationId: invite.organizationId,
        userId: session.user.id,
      },
      select: { id: true, clientId: true },
    })
    if (member && member.clientId !== invite.clientId) {
      await prisma.member.update({
        where: { id: member.id },
        data: { clientId: invite.clientId, role: "client" },
      })
    }

    await prisma.portalInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    })
    return { portal: true }
  }
}
