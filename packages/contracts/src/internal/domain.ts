import { z } from "zod"

import {
  INTERNAL_API_VERSION,
  MemberRoleSchema,
  MemberRolesSchema,
  SERVICE_SCOPES,
  internalPath,
} from "./contracts"

/**
 * Delegated domain calls.
 *
 * Copilot is the only caller of the domain internal APIs. A client-credentials
 * token proves *which app* is calling; the delegated context below proves *on
 * whose behalf* it acts. The target app never trusts a database row from the
 * caller: it re-applies its own organization, role and portal-visibility rules.
 */

export const DelegatedContextSchema = z.object({
  userId: z.string().min(1),
  userName: z.string().min(1),
  userEmail: z.string().email(),
  organizationId: z.string().min(1),
  role: MemberRoleSchema,
  roles: MemberRolesSchema.optional(),
  /** Set when a platform operator impersonates the user. */
  impersonatedBy: z.string().min(1).nullable().optional(),
  /**
   * Portal callers only. The target app must filter every row by this client
   * company; it never accepts a project/client id from the client itself.
   */
  portal: z
    .object({
      clientId: z.string().min(1),
      clientName: z.string().min(1),
    })
    .nullable()
    .optional(),
})
export type DelegatedContext = z.infer<typeof DelegatedContextSchema>

/** Every domain call carries the same envelope. */
export const DomainCallSchema = z.object({
  context: DelegatedContextSchema,
  input: z.unknown().optional(),
})
export type DomainCall = z.infer<typeof DomainCallSchema>

export const DomainOperationScopeSchema = z.enum(["read", "write"])
export type DomainOperationScope = z.infer<typeof DomainOperationScopeSchema>

/**
 * Operations exposed by the domain apps. The operation name is also the last
 * path segment, so a route audit is a one-line grep.
 */
export const DOMAIN_OPERATIONS = [
  // projects
  "list-projects",
  "get-project",
  "list-tasks",
  "list-calendar-tasks",
  "list-project-options",
  "count-projects-by-client",
  "count-client-projects",
  "list-client-projects",
  "set-project-client",
  "update-project-employee",
  "list-user-repository-tokens",
  "set-user-repository-token",
  "remove-user-repository-token",
  "create-project",
  "create-task",
  "update-task",
  "move-task",
  "list-project-messages",
  "create-project-message",
  "list-task-comments",
  "create-task-comment",
  // projects — portal read models (client visibility enforced by the app)
  "portal-list-projects",
  "portal-list-unread-messages",
  "portal-get-project",
  "portal-get-task",
  "portal-list-messages",
  "portal-create-message",
  "portal-list-task-comments",
  "portal-create-task-comment",
  // calendars + meetings
  "list-calendars",
  "ensure-personal-calendar",
  "create-event",
  "respond-to-event",
  "list-meeting-requests",
  "accept-meeting-request",
  "decline-meeting-request",
  "get-meeting-settings",
  "update-meeting-settings",
  "portal-get-meetings",
  "portal-create-meeting",
  "portal-cancel-meeting",
  // files
  "list-files",
  "create-folder",
  "create-files",
  "rename-file",
  "move-file",
  "trash-file",
  "create-uploaded-file",
  "get-file-quota",
  "get-storage-usage",
  "list-file-options",
  "find-file",
  "find-files-by-ids",
  // messages
  "list-conversations",
  "list-messages",
  "send-message",
  "create-channel",
  // clients
  "get-clients-overview",
  "get-client",
  "get-deal",
  "save-client",
  "save-contact",
  "save-deal",
  "move-deal",
  "create-client-activity",
  "list-client-documents",
  "link-client-document",
  "unlink-client-document",
  "link-client-project",
  "unlink-client-project",
  "portal-list-documents",
  "portal-get-document",
  "portal-create-document",
  "portal-get-client",
  "list-client-directory",
  "save-client-basics",
  // clients — test feedback per release (#132)
  "list-project-feedback",
  "portal-list-release-reports",
  "portal-get-release-report",
  // employees
  "get-employees-overview",
  "fetch-attendance",
  "set-attendance",
  "set-day-status",
  "create-leave",
  "decide-leave",
  "fetch-tracking",
] as const

export type DomainOperation = (typeof DOMAIN_OPERATIONS)[number]

/** Operations that mutate data; every other operation is a read. */
const WRITE_OPERATIONS: ReadonlySet<DomainOperation> = new Set([
  "create-project",
  "create-task",
  "update-task",
  "move-task",
  "create-project-message",
  "create-task-comment",
  "portal-create-message",
  "portal-create-task-comment",
  "portal-create-meeting",
  "portal-cancel-meeting",
  "create-event",
  "respond-to-event",
  "accept-meeting-request",
  "decline-meeting-request",
  "update-meeting-settings",
  "create-folder",
  "create-files",
  "rename-file",
  "move-file",
  "trash-file",
  "create-uploaded-file",
  "set-project-client",
  "update-project-employee",
  "set-user-repository-token",
  "remove-user-repository-token",
  "send-message",
  "create-channel",
  "save-client",
  "save-contact",
  "save-deal",
  "move-deal",
  "create-client-activity",
  "link-client-document",
  "unlink-client-document",
  "link-client-project",
  "unlink-client-project",
  "save-client-basics",
  "portal-create-document",
  "set-attendance",
  "set-day-status",
  "create-leave",
  "decide-leave",
])

export function isDomainOperation(value: string): value is DomainOperation {
  return (DOMAIN_OPERATIONS as readonly string[]).includes(value)
}

export function domainOperationScope(
  operation: DomainOperation
): DomainOperationScope {
  return WRITE_OPERATIONS.has(operation) ? "write" : "read"
}

export function domainOperationScopeName(
  operation: DomainOperation
): (typeof SERVICE_SCOPES)["domainRead" | "domainWrite"] {
  return domainOperationScope(operation) === "write"
    ? SERVICE_SCOPES.domainWrite
    : SERVICE_SCOPES.domainRead
}

/** `POST /internal/v1/{app}/{operation}` — one path per operation. */
export function domainPath(app: string, operation: string): string {
  return internalPath("domain", app, operation)
}

/** The domain apps that expose delegated domain calls. */
export const DOMAIN_APP_KEYS = [
  "projects",
  "calendars",
  "files",
  "messages",
  "clients",
  "employees",
] as const
export type DomainAppKey = (typeof DOMAIN_APP_KEYS)[number]

/** Response envelope for a domain call. */
export function domainEnvelope<T extends z.ZodType>(data: T) {
  return z.object({
    data,
    meta: z
      .object({
        app: z.string().min(1),
        version: z.literal(INTERNAL_API_VERSION),
        requestId: z.string().min(1),
      })
      .optional(),
  })
}

// ---------------------------------------------------------------------------
// Shared read models
// ---------------------------------------------------------------------------

export const ProjectMessageSchema = z.object({
  id: z.string().min(1),
  body: z.string(),
  authorId: z.string().min(1),
  authorKind: z.enum(["internal", "client"]),
  authorName: z.string(),
  createdAt: z.string().min(1),
})
export type ProjectMessage = z.infer<typeof ProjectMessageSchema>

export const TaskCommentSchema = z.object({
  id: z.string().min(1),
  authorId: z.string().min(1),
  authorKind: z.enum(["internal", "client"]),
  authorName: z.string().optional(),
  body: z.string(),
  createdAt: z.string().min(1),
})
export type TaskComment = z.infer<typeof TaskCommentSchema>

export const PortalPolicySchema = z.enum(["none", "read", "read_write"])

export const PortalProjectSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.string(),
  dueDate: z.string().optional(),
  doneTasks: z.number().int().nonnegative(),
  totalTasks: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative().default(0),
})
export type PortalProjectSummary = z.infer<typeof PortalProjectSummarySchema>

export const PortalProjectDetailSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  status: z.string(),
  dueDate: z.string().optional(),
  createdAt: z.string(),
  tasks: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      status: z.string(),
      dueDate: z.string().optional(),
    })
  ),
  discussionPolicy: PortalPolicySchema,
  taskCommentsPolicy: PortalPolicySchema,
})
export type PortalProjectDetail = z.infer<typeof PortalProjectDetailSchema>

export const PortalTaskDetailSchema = z.object({
  id: z.string().min(1),
  identifier: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.string(),
  priority: z.string(),
  dueDate: z.string().optional(),
  endDate: z.string().optional(),
  createdAt: z.string(),
  labels: z.array(z.string()),
  subtasks: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      done: z.boolean(),
    })
  ),
})
export type PortalTaskDetail = z.infer<typeof PortalTaskDetailSchema>

export const PortalDocumentSchema = z.object({
  id: z.string().min(1),
  fileId: z.string().min(1),
  name: z.string(),
  sizeBytes: z.number().nonnegative().optional(),
  createdAt: z.string(),
  addedByName: z.string().optional(),
  isNew: z.boolean().optional(),
})
export type PortalDocument = z.infer<typeof PortalDocumentSchema>

export const PortalDocumentLinkSchema = z.object({
  name: z.string(),
  mimeType: z.string().optional(),
  trashed: z.boolean(),
  sizeBytes: z.number().nonnegative().optional(),
})
export type PortalDocumentLink = z.infer<typeof PortalDocumentLinkSchema>

export const PortalMeetingsSchema = z.object({
  settings: z.unknown(),
  requests: z.array(z.unknown()),
})
export type PortalMeetings = z.infer<typeof PortalMeetingsSchema>

/** Client test feedback on the releases of one project (#132, ADR 0040). */
export const ProjectFeedbackReleaseSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  clientName: z.string(),
  version: z.string(),
  label: z.string().optional(),
  releasedAt: z.string().optional(),
  status: z.string(),
  openCount: z.number().int().nonnegative(),
  feedbackCount: z.number().int().nonnegative(),
  /** The company's feedback page in the clients app. */
  url: z.string().url(),
  feedback: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      status: z.string(),
      category: z.string(),
      impact: z.string(),
      testedAt: z.string(),
      contactName: z.string().optional(),
      linkedTaskId: z.string().optional(),
    })
  ),
})
export type ProjectFeedbackRelease = z.infer<
  typeof ProjectFeedbackReleaseSchema
>

/** A release report shared with the portal (ADR 0040). */
export const PortalReleaseSummarySchema = z.object({
  id: z.string().min(1),
  version: z.string(),
  label: z.string().optional(),
  releasedAt: z.string().optional(),
  status: z.string(),
  openCount: z.number().int().nonnegative(),
  feedbackCount: z.number().int().nonnegative(),
})
export type PortalReleaseSummary = z.infer<typeof PortalReleaseSummarySchema>

const CountsSchema = z.record(z.string(), z.number().int().nonnegative())

/** The portal copy of a release report: no notes, assignees or authors. */
export const PortalReleaseReportSchema = z.object({
  release: z.object({
    id: z.string().min(1),
    clientId: z.string().min(1),
    version: z.string(),
    label: z.string().optional(),
    releasedAt: z.string().optional(),
    status: z.string(),
    testedFrom: z.string().optional(),
    testedTo: z.string().optional(),
  }),
  clientName: z.string(),
  generatedAt: z.string(),
  summary: z.object({
    total: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
    byStatus: CountsSchema,
    byCategory: CountsSchema,
    byImpact: CountsSchema,
  }),
  feedback: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      body: z.string(),
      status: z.string(),
      category: z.string(),
      impact: z.string(),
      environment: z.string(),
      testedAt: z.string(),
      contactName: z.string().optional(),
    })
  ),
})
export type PortalReleaseReport = z.infer<typeof PortalReleaseReportSchema>

/** Idempotent mutation result used by the generic client on retries. */
export const DomainMutationResultSchema = z.object({
  id: z.string().optional(),
  created: z.boolean().optional(),
})
