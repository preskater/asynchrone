import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@workspace/core/errors"
import type { RequestContext } from "@workspace/core/context"
import type { ProjectDb } from "../db"
import { ROLE_RANK } from "@workspace/organization/roles"

import {
  decryptSecret,
  encryptSecret,
  generateWebhookSecret,
  createProviderClient,
  RepositoryApiError,
} from "@workspace/integrations"
import type {
  RepositoryConnectionRepository,
  RepositoryConnectionRow,
} from "./repository"
import {
  buildProviderClient,
  closeIssueForTask,
  ensurePullRequestForTask,
  parseRemoteDate,
  pushTaskContent,
  pushTaskState,
  syncConnection,
} from "./sync"
import {
  repositoryProviderLabel,
  type ConnectRepositoryInput,
  type ConnectRepositoryResult,
  type RepositoryConnectionView,
  type RepositoryProvider,
  type RepositorySyncSummary,
  type SetUserRepositoryTokenInput,
  type TaskExternalLink,
  type UserRepositoryTokenStatus,
} from "./types"

/**
 * The task panel persists title/description per keystroke; remote content
 * pushes are coalesced for this long after the last edit. Status changes are
 * pushed immediately (they drive closing and PR creation).
 */
const CONTENT_PUSH_DEBOUNCE_MS = 2_000

/**
 * Maps a provider rejection to a user-facing access error. Returns null for
 * transient failures (outages, rate limits, bugs), which callers treat as
 * best-effort.
 */
function repositoryAccessError(error: unknown): AppError | null {
  if (
    error instanceof RepositoryApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  ) {
    return new ForbiddenError(
      "Your token does not give you access to this repository.",
      { code: "repository_access_denied" }
    )
  }
  return null
}

/**
 * Two-way sync between project tasks and GitHub/GitLab issues.
 *
 * Provider calls run with the acting user's personal token (saved in their
 * profile), so issues and pull requests are authored by and attributed to
 * them, and users without repository access are rejected by the provider.
 * Access failures surface on create/move/delete; transient failures are
 * logged and reconciled by the next sync.
 */
export class RepositoryIntegrationService {
  private readonly contentPushTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >()

  constructor(
    private readonly repo: RepositoryConnectionRepository,
    private readonly db: ProjectDb,
    private readonly options: {
      appBaseUrl?: string
      /**
       * The linked provider token Better Auth stored for this user. The
       * identity database owns `account`, so a domain app reads it through
       * Copilot's internal API.
       */
      accountToken?: (
        userId: string,
        provider: RepositoryProvider
      ) => Promise<string | null>
    } = {}
  ) {}

  private canManage(ctx: RequestContext) {
    if ((ROLE_RANK[ctx.role] ?? 0) >= 3) return
    throw new ForbiddenError(
      "Your role cannot manage repository connections.",
      { code: "role_cannot_manage_integrations" }
    )
  }

  private async projectExists(ctx: RequestContext, projectId: string) {
    const project = await this.db.project.findFirst({
      where: { id: projectId, organizationId: ctx.organizationId },
      select: { id: true },
    })
    if (!project) throw new NotFoundError("Project")
  }

  private toView(
    connection: RepositoryConnectionRow
  ): RepositoryConnectionView {
    const appUrl = this.options.appBaseUrl ?? ""
    return {
      id: connection.id,
      projectId: connection.projectId,
      provider: connection.provider as RepositoryProvider,
      owner: connection.owner,
      repo: connection.repo,
      repoUrl: connection.repoUrl,
      baseUrl: connection.baseUrl ?? undefined,
      webhookUrl: `${appUrl}/api/webhooks/repositories/${connection.id}`,
      webhookSecret: connection.webhookSecret,
      createdById: connection.createdById,
      lastSyncedAt: connection.lastSyncedAt?.toISOString(),
      createdAt: connection.createdAt.toISOString(),
    }
  }

  // -------------------------------------------------------------------------
  // Personal tokens (Account settings)
  // -------------------------------------------------------------------------

  /** Which providers the current user has a personal token for. */
  async listUserTokens(
    ctx: RequestContext
  ): Promise<UserRepositoryTokenStatus> {
    const rows = await this.db.userRepositoryToken.findMany({
      where: { userId: ctx.userId },
      select: { provider: true },
    })
    return {
      github: rows.some((row) => row.provider === "github"),
      gitlab: rows.some((row) => row.provider === "gitlab"),
    }
  }

  /** Stores (or replaces) the user's personal access token for a provider. */
  async setUserToken(
    ctx: RequestContext,
    input: SetUserRepositoryTokenInput
  ): Promise<{ provider: RepositoryProvider; configured: true }> {
    const accessToken = encryptSecret(input.token)
    await this.db.userRepositoryToken.upsert({
      where: {
        userId_provider: { userId: ctx.userId, provider: input.provider },
      },
      update: { accessToken },
      create: {
        userId: ctx.userId,
        provider: input.provider,
        accessToken,
      },
    })
    return { provider: input.provider, configured: true }
  }

  async removeUserToken(
    ctx: RequestContext,
    provider: RepositoryProvider
  ): Promise<{ provider: RepositoryProvider; configured: false }> {
    await this.db.userRepositoryToken.deleteMany({
      where: { userId: ctx.userId, provider },
    })
    return { provider, configured: false }
  }

  /**
   * The credential behind everything a user does on a repository: their
   * saved personal token, falling back to a linked OAuth account token.
   */
  private async resolveUserToken(
    userId: string,
    provider: RepositoryProvider
  ): Promise<string | null> {
    const credential = await this.db.userRepositoryToken.findUnique({
      where: { userId_provider: { userId, provider } },
    })
    if (credential?.accessToken) {
      try {
        return decryptSecret(credential.accessToken)
      } catch (error) {
        console.error("[repository-sync] cannot decrypt user token", error)
        return null
      }
    }
    return this.options.accountToken
      ? (await this.options.accountToken(userId, provider)) ?? null
      : null
  }

  /** Like `resolveUserToken`, but throws a clear error when none is saved. */
  private async requireUserToken(
    userId: string,
    provider: RepositoryProvider
  ): Promise<string> {
    const token = await this.resolveUserToken(userId, provider)
    if (!token) {
      const label = repositoryProviderLabel(provider)
      throw new ValidationError(
        `Add your ${label} access token in your profile before doing this.`,
        undefined,
        { code: "repository_user_token_missing", params: { provider: label } }
      )
    }
    return token
  }

  /** Runs a repository write without letting provider errors break the caller. */
  private async bestEffort(context: string, run: () => Promise<void>) {
    try {
      await run()
    } catch (error) {
      console.error(`[repository-sync] ${context}`, error)
    }
  }

  /** Coalesces per-keystroke content edits into a single remote push. */
  scheduleContentPush(actorUserId: string, taskId: string) {
    const previous = this.contentPushTimers.get(taskId)
    if (previous) clearTimeout(previous)
    const timer = setTimeout(() => {
      this.contentPushTimers.delete(taskId)
      void this.bestEffort("task content", async () => {
        const task = await this.db.task.findUnique({ where: { id: taskId } })
        // Local-only tasks have no issue and never gain one.
        if (!task || !task.createIssue) return
        const connection = await this.connectionForProject(
          task.organizationId,
          task.projectId
        )
        if (!connection) return
        const token = await this.resolveUserToken(
          actorUserId,
          connection.provider as RepositoryProvider
        )
        if (!token) return
        await pushTaskContent(this.db, connection, task, token)
      })
    }, CONTENT_PUSH_DEBOUNCE_MS)
    this.contentPushTimers.set(taskId, timer)
  }

  async getConnection(
    ctx: RequestContext,
    projectId: string
  ): Promise<RepositoryConnectionView | null> {
    this.canManage(ctx)
    const connection = await this.repo.findByProject(
      ctx.organizationId,
      projectId
    )
    return connection ? this.toView(connection) : null
  }

  async connect(
    ctx: RequestContext,
    input: ConnectRepositoryInput
  ): Promise<ConnectRepositoryResult> {
    this.canManage(ctx)
    await this.projectExists(ctx, input.projectId)

    const owner = input.owner.trim().replace(/^\/+|\/+$/g, "")
    const repo = input.repo.trim().replace(/\.git$/i, "")
    const baseUrl = input.baseUrl?.trim()
      ? input.baseUrl.trim().replace(/\/+$/, "")
      : null

    if (await this.repo.findByProject(ctx.organizationId, input.projectId)) {
      throw new ConflictError(
        "This project already has a repository connected.",
        { code: "repository_already_connected" }
      )
    }
    if (
      await this.repo.findByRepo(
        ctx.organizationId,
        input.provider,
        owner,
        repo
      )
    ) {
      throw new ConflictError(
        "This repository is already connected to another project.",
        { code: "repository_already_connected" }
      )
    }

    // The connecting user's own token proves access and powers the backfill.
    const token = await this.requireUserToken(ctx.userId, input.provider)
    const probe = createProviderClient({
      provider: input.provider,
      baseUrl,
      owner,
      repo,
      accessToken: token,
      webhookSecret: "",
    })
    let remote
    try {
      remote = await probe.api.getRepository()
    } catch (error) {
      const access = repositoryAccessError(error)
      if (access) throw access
      console.error("[repository-sync] connect probe failed", error)
      throw new ValidationError(
        "Could not reach the repository. Check the owner, name and access token.",
        undefined,
        { code: "repository_connect_failed" }
      )
    }

    const connection = await this.repo.create({
      organizationId: ctx.organizationId,
      projectId: input.projectId,
      provider: input.provider,
      baseUrl,
      owner: remote.owner,
      repo: remote.repo,
      repoUrl: remote.url,
      webhookSecret: generateWebhookSecret(),
      createdById: ctx.userId,
    })

    // Backfill in both directions; keep the connection when it fails so the
    // admin can retry with "Sync now" instead of reconnecting.
    let summary: RepositorySyncSummary = {
      issuesImported: 0,
      issuesUpdated: 0,
      tasksPushed: 0,
    }
    try {
      summary = await syncConnection(this.db, connection, token)
    } catch (error) {
      console.error("[repository-sync] initial sync failed", error)
    }

    const fresh = (await this.repo.findById(connection.id)) ?? connection
    return { connection: this.toView(fresh), summary }
  }

  async disconnect(
    ctx: RequestContext,
    projectId: string
  ): Promise<{ id: string }> {
    this.canManage(ctx)
    const connection = await this.repo.findByProject(
      ctx.organizationId,
      projectId
    )
    if (!connection) {
      throw new ValidationError("No repository is connected.", undefined, {
        code: "repository_not_connected",
      })
    }
    await this.repo.delete(connection.id)
    return { id: connection.id }
  }

  /** Manual reconciliation from the settings tab; errors surface to the user. */
  async sync(
    ctx: RequestContext,
    projectId: string
  ): Promise<RepositorySyncSummary> {
    this.canManage(ctx)
    const connection = await this.repo.findByProject(
      ctx.organizationId,
      projectId
    )
    if (!connection) {
      throw new ValidationError("No repository is connected.", undefined, {
        code: "repository_not_connected",
      })
    }
    const token = await this.requireUserToken(
      ctx.userId,
      connection.provider as RepositoryProvider
    )
    return syncConnection(this.db, connection, token)
  }

  /**
   * Cron entry point: reconciles every connection with the token of whoever
   * connected it (there is no shared credential anymore), isolating
   * failures. Webhooks keep working for connections whose creator removed
   * their token.
   */
  async syncAllConnections(): Promise<{ synced: number; failed: number }> {
    const connections = await this.repo.listAll()
    const result = { synced: 0, failed: 0 }
    for (const connection of connections) {
      const token = await this.resolveUserToken(
        connection.createdById,
        connection.provider as RepositoryProvider
      )
      if (!token) {
        result.failed += 1
        console.warn(
          `[repository-sync] skipping ${connection.id}: creator has no token`
        )
        continue
      }
      try {
        await syncConnection(this.db, connection, token)
        result.synced += 1
      } catch (error) {
        result.failed += 1
        console.error(
          `[repository-sync] scheduled sync failed for ${connection.id}`,
          error
        )
      }
    }
    return result
  }

  // -------------------------------------------------------------------------
  // Task operations (called by ProjectService before committing local writes)
  // -------------------------------------------------------------------------

  private connectionForProject(organizationId: string, projectId: string) {
    return this.repo.findByProject(organizationId, projectId)
  }

  /**
   * Reports a new task to the connected repository as an issue, created with
   * the user's token so the issue is authored by and linked to them. Throws
   * when the user has no token or cannot access the repository — callers must
   * not create the task in that case. Transient failures throw as well: in a
   * connected project, a task is expected to exist as an issue unless issue
   * creation was explicitly disabled for it.
   */
  async createTaskInRepository(
    ctx: RequestContext,
    input: {
      projectId: string
      title: string
      description?: string
      status?: string
    }
  ): Promise<TaskExternalLink | null> {
    const connection = await this.connectionForProject(
      ctx.organizationId,
      input.projectId
    )
    if (!connection) return null
    const token = await this.requireUserToken(
      ctx.userId,
      connection.provider as RepositoryProvider
    )
    const client = buildProviderClient(connection, token)
    try {
      const issue = await client.api.createIssue({
        title: input.title,
        body: input.description ?? "",
      })
      if (input.status === "done") {
        // Best effort: a failure here leaves the task linked to an open
        // issue, which the next sync reconciles by closing it.
        try {
          await client.api.updateIssue(issue.number, { state: "closed" })
        } catch (error) {
          console.error("[repository-sync] close on create failed", error)
        }
      }
      return {
        externalIssueNumber: issue.number,
        externalIssueUrl: issue.url,
        externalUpdatedAt: parseRemoteDate(issue.updatedAt),
      }
    } catch (error) {
      const access = repositoryAccessError(error)
      if (access) throw access
      console.error("[repository-sync] issue creation failed", error)
      throw new AppError(
        "repository_issue_create_failed",
        "Could not create the issue in the repository. Please try again.",
        { status: 502 }
      )
    }
  }

  /**
   * Mirrors a status change on the linked issue (close on done, reopen, and a
   * draft PR on review) with the acting user's token. Access problems throw
   * before the caller commits the local change; transient failures are
   * logged and reconciled by the next sync. Tasks created without issue
   * creation are local-only: no issue, no pull request, no token needed.
   */
  async pushTaskStatus(
    ctx: RequestContext,
    taskId: string,
    status: string
  ): Promise<void> {
    const task = await this.db.task.findUnique({ where: { id: taskId } })
    if (!task || !task.createIssue) return
    const connection = await this.connectionForProject(
      task.organizationId,
      task.projectId
    )
    if (!connection) return
    const token = await this.requireUserToken(
      ctx.userId,
      connection.provider as RepositoryProvider
    )
    try {
      await pushTaskState(this.db, connection, task, token, { status })
      if (status === "review") {
        await ensurePullRequestForTask(this.db, connection, task, token)
      }
    } catch (error) {
      const access = repositoryAccessError(error)
      if (access) throw access
      console.error("[repository-sync] task status push failed", error)
    }
  }

  /**
   * Closes the linked issue before its task is deleted — otherwise the next
   * sync would re-import it. Access problems abort the delete.
   */
  async closeTaskIssue(ctx: RequestContext, taskId: string): Promise<void> {
    const task = await this.db.task.findUnique({ where: { id: taskId } })
    if (!task?.externalIssueNumber) return
    const connection = await this.connectionForProject(
      task.organizationId,
      task.projectId
    )
    if (!connection) return
    const token = await this.requireUserToken(
      ctx.userId,
      connection.provider as RepositoryProvider
    )
    try {
      await closeIssueForTask(connection, task.externalIssueNumber, token)
    } catch (error) {
      const access = repositoryAccessError(error)
      if (access) throw access
      console.error("[repository-sync] close on delete failed", error)
    }
  }
}
