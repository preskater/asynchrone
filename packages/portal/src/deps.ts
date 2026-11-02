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
import type {
  PortalDocumentData,
  PortalProjectDetailData,
  PortalTaskDetailData,
} from "./types"

/**
 * Ports the owning app binds in its adapter.
 *
 * The package never imports `apps/copilot/lib/*`: the database, large-object
 * store, files service, project thread, meetings read model, Better Auth
 * invitations, audit writer and notification inbox are injected so the portal
 * can run inside Copilot today and keep its routes there after the split
 * (there is no `apps/portal`).
 */

/** The files-domain operations a portal document needs. */
export interface PortalFiles {
  /** Stream an upload into the workspace file tree (bytes stay in files). */
  createUploadedFile(
    ctx: RequestContext,
    input: {
      name: string
      parentId?: string | null
      sizeBytes: number
      mimeType?: string
      stream: Readable
    }
  ): Promise<{ id: string }>
  /** Open a file's bytes after the caller resolved the client-visible link. */
  openDocument(
    organizationId: string,
    fileId: string,
    metadata: { name: string; mimeType?: string }
  ): Promise<{ name: string; mimeType?: string; size: number; stream: Readable }>
  quotaBytes(organizationId: string): Promise<number>
  usedBytes(organizationId: string): Promise<number>
}

/** The input of one client message on a shared project thread. */
export interface PortalMessageInput {
  organizationId: string
  clientId: string
  clientName: string
  projectId: string
  authorId: string
  authorName: string
  authorKind: "internal" | "client"
  body: string
}

/** The input of one client comment on a task. */
export interface PortalTaskCommentInput {
  organizationId: string
  clientId: string
  clientName: string
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
    clientId: string,
    projectId: string
  ): Promise<ProjectMessageData[]>
  createMessage(input: PortalMessageInput): Promise<ProjectMessageData>
  listTaskComments(
    organizationId: string,
    clientId: string,
    taskId: string
  ): Promise<TaskCommentData[]>
  createTaskComment(input: PortalTaskCommentInput): Promise<TaskCommentData>
}

/** The client-facing meetings read model, bound to `@workspace/meetings`. */
export interface PortalMeetings {
  getPortalMeetings(ctx: PortalContext): Promise<PortalMeetingsData>
}

/** One client-visible project summary, already scoped by the projects app. */
export interface PortalProjectSummaryRow {
  id: string
  name: string
  status: string
  dueDate?: string
  doneTasks: number
  totalTasks: number
}

export interface PortalProjectPolicy {
  clientDiscussion: "none" | "read" | "read_write"
  clientTaskComments: "none" | "read" | "read_write"
}

/**
 * Reports reads and writes, bound to the projects app through its internal API.
 *
 * Every method takes the client company; the target app filters the rows, so a
 * project id from another company is simply not found. The portal service keeps
 * its own policy checks as a second line of defence.
 */
export interface PortalProjects {
  listProjects(
    organizationId: string,
    clientId: string
  ): Promise<PortalProjectSummaryRow[]>
  listUnreadMessages(
    organizationId: string,
    clientId: string,
    projectIds: string[],
    authorId: string,
    since: Date | null
  ): Promise<{ projectId: string }[]>
  findProject(
    organizationId: string,
    clientId: string,
    projectId: string
  ): Promise<PortalProjectDetailData | null>
  findProjectPolicy(
    organizationId: string,
    clientId: string,
    projectId: string
  ): Promise<PortalProjectPolicy | null>
  findProjectTask(
    organizationId: string,
    clientId: string,
    projectId: string,
    taskId: string
  ): Promise<PortalTaskDetailData | null>
  findTask(
    organizationId: string,
    clientId: string,
    projectId: string,
    taskId: string
  ): Promise<{ id: string } | null>
}

/** Client documents, bound to the clients app through its internal API. */
export interface PortalClientDocuments {
  listDocuments(
    organizationId: string,
    clientId: string
  ): Promise<PortalDocumentData[]>
  findDocumentLink(
    organizationId: string,
    clientId: string,
    fileId: string
  ): Promise<{
    name: string
    mimeType?: string
    trashed: boolean
  } | null>
  createDocument(input: {
    organizationId: string
    clientId: string
    fileId: string
    name: string
    sizeBytes: number
    addedBy: string
    addedByName: string
    addedByEmail: string
  }): Promise<{ id: string; createdAt: string }>
  findClient(
    organizationId: string,
    clientId: string
  ): Promise<{ ownerId: string | null; name: string } | null>
  findClientInOrganization(
    organizationId: string,
    clientId: string
  ): Promise<{ id: string } | null>
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
