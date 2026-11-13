import type { UserAuditInput } from "@workspace/audit"
import type { RequestContext } from "@workspace/core/context"
import type { NotifyArgs } from "@workspace/notifications"
import type { MemberDirectoryPort } from "@workspace/organization/directory"

import type { TaskExternalLink } from "./integrations/types"

/**
 * Ports the owning app binds in its adapter.
 *
 * The package never imports `apps/copilot/lib/*`: audit rows, notifications and
 * repository calls are injected so Projects can run inside Copilot today and
 * inside `apps/projects` later without changing the service.
 */

/** Writes one user-facing audit row; request metadata stays with the app. */
export type ProjectAudit = (
  ctx: Pick<
    RequestContext,
    "organizationId" | "userId" | "userName" | "userEmail"
  >,
  input: UserAuditInput
) => Promise<void>

/** Sends one inbox notification (the identity app owns the inbox). */
export type ProjectNotify = (args: NotifyArgs) => Promise<void>

/**
 * The repository operations the task service needs before it commits a local
 * write. `RepositoryIntegrationService` implements it.
 */
export interface ProjectRepositorySync {
  createTaskInRepository(
    ctx: RequestContext,
    input: {
      projectId: string
      title: string
      description?: string
      status?: string
    }
  ): Promise<TaskExternalLink | null>
  pushTaskStatus(
    ctx: RequestContext,
    taskId: string,
    status: string
  ): Promise<void>
  scheduleContentPush(actorUserId: string, taskId: string): void
  closeTaskIssue(ctx: RequestContext, taskId: string): Promise<void>
}

export interface ProjectServicePorts {
  audit: ProjectAudit
  notify: ProjectNotify
  repository: ProjectRepositorySync
  /** Identity reads and the member-management writes the settings card exposes. */
  directory: MemberDirectoryPort
  /** Publishes a real-time hint after a comment is added (#98). */
  changed?: (organizationId: string) => Promise<void>
}
