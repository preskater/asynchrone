/**
 * The client portal domain: dashboard, project/task reads, shared project
 * threads, task comments, client-visible documents (list, upload, download),
 * the "new since last visit" state, portal access management and the client
 * meetings read model.
 *
 * The package owns every rule; Copilot binds its database, large-object store,
 * files service, project thread, meetings service, Better Auth invitations,
 * audit writer and notification inbox through `createPortalRuntime`. The
 * portal has no app of its own: its routes and APIs stay in Copilot.
 */
export {
  isPortalContext,
  requireInternalMember,
  requirePortalContext,
  requirePortalManager,
} from "./context"
export type {
  PortalAudit,
  PortalCollaboration,
  PortalFiles,
  PortalInvitations,
  PortalMeetings,
  PortalMessageInput,
  PortalNotify,
  PortalStorage,
  PortalTaskCommentInput,
} from "./deps"
export { PortalRepository, type PortalDb } from "./repository"
export {
  createPortalRuntime,
  type PortalRuntime,
  type PortalRuntimeOptions,
} from "./runtime"
export {
  MAX_PORTAL_UPLOAD_BYTES,
  PortalService,
  type PortalServiceDeps,
} from "./service"
export * from "./schemas"
export type {
  PortalAccessData,
  PortalContext,
  PortalDashboardData,
  PortalDocumentData,
  PortalDocumentFile,
  PortalInviteData,
  PortalMemberData,
  PortalProjectDetailData,
  PortalProjectSummary,
  PortalSubtaskData,
  PortalTaskData,
  PortalTaskDetailData,
} from "./types"
