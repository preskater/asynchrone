import type {
  PortalPolicy,
  TaskPriority,
  TaskStatus,
} from "@workspace/projects/types"

/**
 * Resolved identity of a signed-in client-portal user.
 *
 * The owning app resolves it from its Better Auth session (`getPortalContext`
 * in `apps/web/lib/core/auth-context.ts`), which requires a `Member` row linked
 * to a client company. The structural copy keeps this package independent from
 * the app's session wiring.
 */
export interface PortalContext {
  userId: string
  userName: string
  userEmail: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  clientId: string
  clientName: string
}

/** One project of the client's company, with its task progress. */
export interface PortalProjectSummary {
  id: string
  name: string
  status: string
  dueDate?: string
  doneTasks: number
  totalTasks: number
  /** Messages posted since the client last opened the portal. */
  unreadCount: number
}

/** A client-visible document shared with the company. */
export interface PortalDocumentData {
  id: string
  fileId: string
  name: string
  sizeBytes?: number
  createdAt: string
  addedByName?: string
  /** Shared since the client last opened the portal. */
  isNew?: boolean
}

export interface PortalDashboardData {
  organizationName: string
  clientName: string
  projects: PortalProjectSummary[]
  documents: PortalDocumentData[]
}

/** A task of a client project (titles, status and deadlines only). */
export interface PortalTaskData {
  id: string
  title: string
  status: string
  dueDate?: string
}

export interface PortalProjectDetailData {
  id: string
  name: string
  description?: string
  status: string
  dueDate?: string
  createdAt: string
  tasks: PortalTaskData[]
  /** Whether the client sees the discussion, and whether they can post. */
  discussionPolicy: PortalPolicy
  /** Whether the client sees task comments, and whether they can add them. */
  taskCommentsPolicy: PortalPolicy
}

/** A subtask of a client-visible task. */
export interface PortalSubtaskData {
  id: string
  title: string
  done: boolean
}

export interface PortalTaskDetailData {
  id: string
  identifier: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  dueDate?: string
  endDate?: string
  createdAt: string
  labels: string[]
  subtasks: PortalSubtaskData[]
}

/** A portal user of a company (internal view). */
export interface PortalMemberData {
  memberId: string
  userId: string
  name: string
  email: string
  createdAt: string
}

/** A pending portal invitation of a company (internal view). */
export interface PortalInviteData {
  id: string
  email: string
  name?: string
  createdAt: string
  invitationId?: string
}

export interface PortalAccessData {
  members: PortalMemberData[]
  invites: PortalInviteData[]
}

/**
 * One client-visible document, resolved for download.
 *
 * The route streams `stream` with the package-selected headers; the large
 * object itself belongs to `@workspace/storage` and is opened by the owning
 * app's port.
 */
export interface PortalDocumentFile {
  name: string
  mimeType?: string
  size: number
  stream: import("node:stream").Readable
}
