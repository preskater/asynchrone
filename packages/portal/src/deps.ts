import type { Readable } from "node:stream"

import type { UserAuditInput } from "@workspace/audit"
import type { RequestContext } from "@workspace/core/context"
import type { CreateMeetingRequestInput } from "@workspace/meetings/schemas"
import type {
  MeetingRequestData,
  PortalMeetingsData,
} from "@workspace/meetings/types"
import type { NotifyArgs } from "@workspace/notifications"
import type { ProjectMessageData } from "@workspace/projects/thread"
import type { TaskCommentData } from "@workspace/projects/task-comments"

import type { PortalContext } from "./types"

/**
 * Ports the owning app binds in its adapter.
 *
 * The package never imports `apps/copilot/lib/*`: the database, large-object
 * store, files service, project thread, meetings read model, Better Auth
 * invitations, audit writer and notification inbox are injected so the portal
 * can run inside Copilot today and keep its routes there after the split
 * (there is no `apps/portal`).
 */

/** Bytes live in PostgreSQL large objects owned by `@workspace/storage`. */
export interface PortalStorage {
  upload(
    readable: Readable,
    options?: { maxBytes?: number }
  ): Promise<{ oid: number; size: number; sha256: string }>
  open(oid: number): Promise<{ size: number; stream: Readable }>
  unlink(oid: number): Promise<void>
}

/** The files-domain operations a portal document needs. */
export interface PortalFiles {
  /** Persist a completed upload in the workspace file tree. */
  createUploadedFile(
    ctx: RequestContext,
    input: {
      name: string
      parentId?: string | null
      sizeBytes: number
      mimeType?: string
      oid: number
      sha256: string
    }
  ): Promise<{ id: string }>
  quotaBytes(organizationId: string): Promise<number>
  usedBytes(organizationId: string): Promise<number>
}

/** The input of one client message on a shared project thread. */
export interface PortalMessageInput {
  organizationId: string
  projectId: string
  authorId: string
  authorKind: "internal" | "client"
  body: string
}

/** The input of one client comment on a task. */
export interface PortalTaskCommentInput {
  organizationId: string
  taskId: string
  authorId: string
  authorKind: "internal" | "client"
  authorName?: string
  body: string
}

/**
 * The shared project thread and task comments, already bound to the app's
 * database and notification inbox (`@workspace/projects/thread` and
 * `@workspace/projects/task-comments`).
 */
export interface PortalCollaboration {
  listMessages(
    organizationId: string,
    projectId: string
  ): Promise<ProjectMessageData[]>
  createMessage(input: PortalMessageInput): Promise<ProjectMessageData>
  listTaskComments(
    organizationId: string,
    taskId: string
  ): Promise<TaskCommentData[]>
  createTaskComment(input: PortalTaskCommentInput): Promise<TaskCommentData>
}

/** The client-facing meetings read model, bound to `@workspace/meetings`. */
export interface PortalMeetings {
  getPortalMeetings(ctx: PortalContext): Promise<PortalMeetingsData>
}

/**
 * Better Auth invitations. The app owns the session and the request headers;
 * the package only decides when an invitation is created or revoked.
 */
export interface PortalInvitations {
  create(organizationId: string, email: string): Promise<{ id: string }>
  cancel(invitationId: string): Promise<void>
  /** The signed-in user, for the post-acceptance claim. */
  currentUser(): Promise<{ id: string; email: string } | null>
}

/** Writes one user-facing audit row; request metadata stays with the app. */
export type PortalAudit = (
  ctx: Pick<
    PortalContext,
    "organizationId" | "userId" | "userName" | "userEmail"
  >,
  input: UserAuditInput
) => Promise<void>

/** Sends one inbox notification (the identity app owns the inbox). */
export type PortalNotify = (args: NotifyArgs) => Promise<void>

export type { CreateMeetingRequestInput, MeetingRequestData }
