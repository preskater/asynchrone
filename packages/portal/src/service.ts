import type { Readable } from "node:stream"

import { AUDIT_ACTIONS } from "@workspace/audit"
import type { RequestContext } from "@workspace/core/context"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@workspace/core/errors"
import type { PortalMeetingsData } from "@workspace/meetings/types"
import type { ProjectMessageData } from "@workspace/projects/thread"
import type { TaskCommentData } from "@workspace/projects/task-comments"
import type {
  PortalPolicy,
  TaskPriority,
  TaskStatus,
} from "@workspace/projects/types"
import { MaxBytesExceededError } from "@workspace/storage"

import { requireInternalMember, requirePortalManager } from "./context"
import type {
  PortalAudit,
  PortalCollaboration,
  PortalFiles,
  PortalInvitations,
  PortalMeetings,
  PortalNotify,
  PortalStorage,
} from "./deps"
import type { PortalRepository } from "./repository"
import type { InvitePortalUserInput } from "./schemas"
import type {
  PortalAccessData,
  PortalContext,
  PortalDashboardData,
  PortalDocumentData,
  PortalDocumentFile,
  PortalProjectDetailData,
  PortalTaskDetailData,
} from "./types"

/** Direct uploads from the portal are capped to keep the single request sane. */
export const MAX_PORTAL_UPLOAD_BYTES = 25 * 1024 * 1024

function iso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined
}

export interface PortalServiceDeps {
  repository: PortalRepository
  storage: PortalStorage
  files: PortalFiles
  collaboration: PortalCollaboration
  meetings: PortalMeetings
  invitations: PortalInvitations
  audit: PortalAudit
  notify: PortalNotify
}

/**
 * The client portal domain: dashboard, project/task reads, shared threads,
 * task comments, client-visible documents (list, upload, download), the
 * "new since last visit" state, portal access management and the client
 * meetings read model.
 *
 * Every client-facing query is scoped by `organizationId` and `clientId`, so a
 * portal account only ever sees the company it was invited to. Portal access
 * management requires an internal member, and only owners/admins can invite or
 * revoke.
 */
export class PortalService {
  constructor(private readonly deps: PortalServiceDeps) {}

  private get repo() {
    return this.deps.repository
  }

  // ---------------------------------------------------------------------------
  // Client-facing reads
  // ---------------------------------------------------------------------------

  /** Dashboard of the signed-in client: their projects and shared documents. */
  async getDashboard(ctx: PortalContext): Promise<PortalDashboardData> {
    const lastSeen = await this.lastSeenAt(ctx)
    const [projects, links] = await Promise.all([
      this.repo.listDashboardProjects(ctx.organizationId, ctx.clientId),
      this.repo.listClientDocuments(ctx.organizationId, ctx.clientId),
    ])

    // Unread messages per project: anything the client has not seen yet,
    // excluding their own posts.
    const projectIds = projects.map((project) => project.id)
    const unreadByProject = new Map<string, number>()
    if (projectIds.length > 0) {
      const messages = await this.repo.listUnreadMessages(
        ctx.organizationId,
        projectIds,
        ctx.userId,
        lastSeen
      )
      for (const message of messages) {
        unreadByProject.set(
          message.projectId,
          (unreadByProject.get(message.projectId) ?? 0) + 1
        )
      }
    }

    return {
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
  }

  /** One project of the client's company. Anything else is not found. */
  async getProject(
    ctx: PortalContext,
    projectId: string
  ): Promise<PortalProjectDetailData> {
    const project = await this.repo.findProject(
      ctx.organizationId,
      ctx.clientId,
      projectId
    )
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

  /** The client-facing meetings read model, bound to `@workspace/meetings`. */
  getMeetings(ctx: PortalContext): Promise<PortalMeetingsData> {
    return this.deps.meetings.getPortalMeetings(ctx)
  }

  // ---------------------------------------------------------------------------
  // Client collaboration
  // ---------------------------------------------------------------------------

  /** The shared project thread of one of the client's projects. */
  async listMessages(
    ctx: PortalContext,
    projectId: string
  ): Promise<ProjectMessageData[]> {
    const project = await this.repo.findProjectPolicy(
      ctx.organizationId,
      ctx.clientId,
      projectId
    )
    if (!project) throw new NotFoundError("Project")
    if (project.clientDiscussion === "none") return []
    return this.deps.collaboration.listMessages(ctx.organizationId, projectId)
  }

  /** Post a message as the client; the team gets an in-app notification. */
  async postMessage(
    ctx: PortalContext,
    projectId: string,
    body: string
  ): Promise<ProjectMessageData> {
    const text = body.trim()
    if (!text) throw new ValidationError("The message is empty.")
    const project = await this.repo.findProjectPolicy(
      ctx.organizationId,
      ctx.clientId,
      projectId
    )
    if (!project) throw new NotFoundError("Project")
    if (project.clientDiscussion !== "read_write") {
      throw new ForbiddenError("The discussion is read-only for this client.", {
        code: "portal_read_only",
      })
    }
    return this.deps.collaboration.createMessage({
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
    const project = await this.repo.findProjectPolicy(
      ctx.organizationId,
      ctx.clientId,
      projectId
    )
    if (!project) throw new NotFoundError("Project")

    const task = await this.repo.findProjectTask(
      ctx.organizationId,
      projectId,
      taskId
    )
    if (!task) throw new NotFoundError("Task")

    const policy = project.clientTaskComments as PortalPolicy
    const comments =
      policy === "none"
        ? []
        : await this.deps.collaboration.listTaskComments(
            ctx.organizationId,
            taskId
          )

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
    const project = await this.repo.findProjectPolicy(
      ctx.organizationId,
      ctx.clientId,
      projectId
    )
    if (!project) throw new NotFoundError("Project")
    if (project.clientTaskComments !== "read_write") {
      throw new ForbiddenError("Task comments are read-only for this client.", {
        code: "portal_read_only",
      })
    }
    const task = await this.repo.findTask(ctx.organizationId, projectId, taskId)
    if (!task) throw new NotFoundError("Task")
    return this.deps.collaboration.createTaskComment({
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
    const links = await this.repo.listClientDocuments(
      ctx.organizationId,
      ctx.clientId
    )

    const nameById = new Map<string, string>()
    const addedByIds = [...new Set(links.map((link) => link.addedBy))]
    if (addedByIds.length > 0) {
      const users = await this.repo.listUserNames(addedByIds)
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
   * Open one client-visible document for download. The link row is the
   * authorization: a portal account never downloads a file that was not shared
   * with its company, and a trashed or missing large object is not found.
   */
  async openDocument(
    ctx: PortalContext,
    fileId: string
  ): Promise<PortalDocumentFile> {
    const link = await this.repo.findClientDocumentLink(
      ctx.organizationId,
      ctx.clientId,
      fileId
    )
    if (!link || link.file.trashed || link.file.oid === null) {
      throw new NotFoundError("Document")
    }

    const { size, stream } = await this.deps.storage.open(Number(link.file.oid))
    return {
      name: link.file.name,
      mimeType: link.file.mimeType ?? undefined,
      size,
      stream,
    }
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
      this.deps.files.quotaBytes(ctx.organizationId),
      this.deps.files.usedBytes(ctx.organizationId),
    ])
    if (used + input.sizeBytes > quota) {
      throw new ConflictError("The workspace is out of storage.", {
        code: "storage_quota_exceeded",
      })
    }

    let uploaded
    try {
      uploaded = await this.deps.storage.upload(input.stream, {
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
    const file = await this.deps.files.createUploadedFile(fileCtx, {
      name: input.name,
      parentId: null,
      sizeBytes: uploaded.size,
      mimeType: input.mimeType,
      oid: uploaded.oid,
      sha256: uploaded.sha256,
    })

    const link = await this.repo.createClientDocument({
      organizationId: ctx.organizationId,
      fileId: file.id,
      clientId: ctx.clientId,
      addedBy: ctx.userId,
    })

    // Surface the upload on the company timeline like an internal link would.
    await this.deps.audit(ctx, {
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
      this.repo.findClient(ctx.clientId),
      this.repo.listClientAdmins(ctx.organizationId),
    ])

    const recipients = new Set<string>()
    if (client?.ownerId) recipients.add(client.ownerId)
    for (const admin of admins) recipients.add(admin.userId)

    await Promise.all(
      [...recipients].map((userId) =>
        this.deps.notify({
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
    const member = await this.repo.lastSeenAt(ctx.organizationId, ctx.userId)
    return member?.portalLastSeenAt ?? null
  }

  /**
   * Called from the client after the portal paints: anything rendered as new
   * stays new for this visit and only clears on the next one.
   */
  async markSeen(ctx: PortalContext): Promise<void> {
    await this.repo.markSeen(ctx.organizationId, ctx.userId)
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
      this.repo.listAccessMembers(ctx.organizationId, clientId),
      this.repo.listPendingInvites(ctx.organizationId, clientId),
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

    const client = await this.repo.findClientInOrganization(
      ctx.organizationId,
      input.clientId
    )
    if (!client) throw new NotFoundError("Client")

    const email = input.email.toLowerCase()
    const existingMember = await this.repo.findMemberByEmail(
      ctx.organizationId,
      email
    )
    if (existingMember) {
      throw new ConflictError("That email is already a member.", {
        code: "email_already_member",
      })
    }
    const existingInvite = await this.repo.findPendingInvite(
      ctx.organizationId,
      input.clientId,
      email
    )
    if (existingInvite) {
      throw new ConflictError(
        "That email already has a pending portal invitation.",
        { code: "portal_invite_exists" }
      )
    }

    const invitation = await this.deps.invitations.create(
      ctx.organizationId,
      email
    )

    const row = await this.repo.createInvite({
      organizationId: ctx.organizationId,
      clientId: input.clientId,
      email,
      name: input.name || null,
      invitationId: invitation.id,
      invitedById: ctx.userId,
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
    const member = await this.repo.findAccessMember(
      ctx.organizationId,
      memberId
    )
    if (!member) throw new NotFoundError("Member")
    await this.repo.deleteMember(memberId)
    return { id: memberId }
  }

  /** Cancel a pending portal invitation (revokes the better-auth invitation). */
  async cancelInvite(
    ctx: RequestContext,
    inviteId: string
  ): Promise<{ id: string }> {
    requirePortalManager(ctx)
    const invite = await this.repo.findInvite(ctx.organizationId, inviteId)
    if (!invite) throw new NotFoundError("Invitation")
    if (invite.invitationId) {
      try {
        await this.deps.invitations.cancel(invite.invitationId)
      } catch {
        // The invitation may already be accepted, expired or cancelled.
      }
    }
    await this.repo.deleteInvite(inviteId)
    return { id: inviteId }
  }

  /**
   * Called right after a client accepts their invitation: links the fresh
   * member row to the invited company and returns whether it was a portal
   * invitation.
   */
  async claim(invitationId: string): Promise<{ portal: boolean }> {
    const user = await this.deps.invitations.currentUser()
    if (!user) throw new UnauthorizedError()

    const invite = await this.repo.findClaimInvite(invitationId)
    if (!invite) return { portal: false }
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return { portal: false }
    }

    const member = await this.repo.findMemberForUser(
      invite.organizationId,
      user.id
    )
    if (member && member.clientId !== invite.clientId) {
      await this.repo.updateMemberClient(member.id, invite.clientId)
    }

    await this.repo.markInviteAccepted(invite.id)
    return { portal: true }
  }
}
