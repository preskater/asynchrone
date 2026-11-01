import type { ProjectDb } from "../db"
import { allocateTaskIdentifier, taskPrefix } from "../task-key"

import { createProviderClient } from "@workspace/integrations"
import type { RepositoryConnectionRow } from "./repository"
import {
  REPOSITORY_PROVIDERS,
  type RemoteIssue,
  type RemotePullRequest,
  type RepositoryProvider,
  type RepositorySyncSummary,
  type RepositoryWebhookEvent,
} from "./types"

export type SyncTaskRow = NonNullable<
  Awaited<ReturnType<ProjectDb["task"]["findUnique"]>>
>

function logSyncError(context: string, error: unknown) {
  console.error(`[repository-sync] ${context}`, error)
}

export function parseRemoteDate(value: string): Date | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeBody(body: string): string | null {
  const trimmed = body.trim()
  return trimmed === "" ? null : body
}

/** Kanban status → remote issue state. `done` tasks close their issue. */
export function issueStateForStatus(status: string): "open" | "closed" {
  return status === "done" ? "closed" : "open"
}

export function isRepositoryProvider(
  value: string
): value is RepositoryProvider {
  return (REPOSITORY_PROVIDERS as readonly string[]).includes(value)
}

export function buildProviderClient(
  connection: Pick<
    RepositoryConnectionRow,
    "provider" | "baseUrl" | "owner" | "repo" | "webhookSecret"
  >,
  token: string
) {
  if (!isRepositoryProvider(connection.provider)) {
    throw new Error(`Unsupported repository provider: ${connection.provider}`)
  }
  return createProviderClient({
    provider: connection.provider,
    baseUrl: connection.baseUrl,
    owner: connection.owner,
    repo: connection.repo,
    accessToken: token,
    webhookSecret: connection.webhookSecret,
  })
}

// ---------------------------------------------------------------------------
// Remote → local
// ---------------------------------------------------------------------------

/**
 * Creates a local task from a remote issue. Open issues become `todo` tasks;
 * issues that arrive closed only import when linked to an existing task, so
 * this is only called for open issues or through `applyRemoteIssue`.
 */
export async function createTaskFromIssue(
  db: ProjectDb,
  connection: RepositoryConnectionRow,
  issue: RemoteIssue
): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: connection.projectId },
    select: { name: true },
  })
  if (!project) return
  const existing = await db.task.findMany({
    where: { projectId: connection.projectId },
    select: { identifier: true, order: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  })
  const prefix = taskPrefix(
    project.name,
    existing.map((task) => task.identifier)
  )
  const nextOrder =
    existing.reduce((max, task) => Math.max(max, task.order), -1) + 1
  const identifier = await allocateTaskIdentifier(
    db,
    connection.organizationId,
    prefix
  )
  await db.task.create({
    data: {
      organizationId: connection.organizationId,
      projectId: connection.projectId,
      identifier,
      title: issue.title,
      description: normalizeBody(issue.body),
      status: issue.state === "closed" ? "done" : "todo",
      order: nextOrder,
      externalIssueNumber: issue.number,
      externalIssueUrl: issue.url,
      externalUpdatedAt: parseRemoteDate(issue.updatedAt),
    },
  })
}

/**
 * Applies a remote issue to its linked task: title and description follow the
 * issue, closed issues mark the task done and reopened ones move it back to
 * `todo`. Returns `stale` instead of writing when the payload is not newer
 * than the last remote revision already applied here; webhook echoes of our
 * own pushes (equal timestamp) are ignored so in-flight local edits survive.
 */
export async function applyRemoteIssue(
  db: ProjectDb,
  task: SyncTaskRow,
  issue: RemoteIssue
): Promise<"updated" | "unchanged" | "stale"> {
  const remoteUpdatedAt = parseRemoteDate(issue.updatedAt)
  if (
    remoteUpdatedAt &&
    task.externalUpdatedAt &&
    remoteUpdatedAt.getTime() <= task.externalUpdatedAt.getTime()
  ) {
    return "stale"
  }
  const description = normalizeBody(issue.body)
  let status = task.status
  if (issue.state === "closed" && task.status !== "done") {
    status = "done"
  } else if (issue.state === "open" && task.status === "done") {
    status = "todo"
  }
  const changed =
    task.title !== issue.title ||
    (task.description ?? null) !== description ||
    task.status !== status
  if (!changed) return "unchanged"
  await db.task.update({
    where: { id: task.id },
    data: {
      title: issue.title,
      description,
      status,
      externalIssueUrl: issue.url,
      externalUpdatedAt: remoteUpdatedAt,
    },
  })
  return "updated"
}

/** Finds the task linked to a remote issue number, if any. */
export function findTaskByIssueNumber(
  db: ProjectDb,
  projectId: string,
  issueNumber: number
) {
  return db.task.findFirst({
    where: { projectId, externalIssueNumber: issueNumber },
  })
}

export async function applyIssueEvent(
  db: ProjectDb,
  connection: RepositoryConnectionRow,
  event: Extract<RepositoryWebhookEvent, { kind: "issue" }>
): Promise<void> {
  const task = await findTaskByIssueNumber(
    db,
    connection.projectId,
    event.issue.number
  )
  if (!task) {
    if (event.action === "opened") {
      await createTaskFromIssue(db, connection, event.issue)
    }
    return
  }
  if (event.action === "deleted") return
  await applyRemoteIssue(db, task, event.issue)
}

/**
 * Finds the task an incoming pull/merge request refers to. Branches created by
 * Asynchrone Space embed the issue number (`asynchrone-space/<n>-…`); opening links written by
 * hand usually reference the issue as `#<n>` in the title or description.
 */
export function issueNumberFromPullRequest(
  pullRequest: RemotePullRequest
): number | null {
  const branch = pullRequest.sourceBranch.match(
    /^asynchrone-space\/(\d+)(?:-|$)/
  )
  if (branch) return Number(branch[1])
  const reference = `${pullRequest.title}\n${pullRequest.body}`.match(
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)?\s*#(\d+)/i
  )
  if (reference) return Number(reference[1])
  return null
}

/**
 * Applies a pull/merge request to its linked task: an open PR marks the task
 * "For Review", a merged PR marks it done. Returns false when no task matches.
 */
export async function applyPullRequestEvent(
  db: ProjectDb,
  connection: RepositoryConnectionRow,
  pullRequest: RemotePullRequest
): Promise<boolean> {
  const issueNumber = issueNumberFromPullRequest(pullRequest)
  if (!issueNumber) return false
  const task = await findTaskByIssueNumber(
    db,
    connection.projectId,
    issueNumber
  )
  if (!task) return false
  const data: {
    status?: string
    externalPrNumber: number
    externalPrUrl: string
  } = {
    externalPrNumber: pullRequest.number,
    externalPrUrl: pullRequest.url,
  }
  if (pullRequest.state === "merged") {
    if (task.status !== "done") data.status = "done"
  } else if (pullRequest.state === "open" && task.status !== "review") {
    // An open PR means review work, even on a task that was marked done.
    data.status = "review"
  }
  await db.task.update({ where: { id: task.id }, data })
  return true
}

// ---------------------------------------------------------------------------
// Local → remote
// ---------------------------------------------------------------------------

/**
 * Makes sure the task has an issue and returns the refreshed row. Creation is
 * lazy so tasks that existed before a repository was connected are pushed on
 * the first write (and on connect via the backfill). Callers may pass a stale
 * row (e.g. before a previous push linked the issue); the database is
 * re-read before creating anything so no duplicate issue is produced. Tasks
 * created with issue creation disabled are never reported: they stay local
 * and get no issue or pull request.
 */
export async function ensureIssueForTask(
  db: ProjectDb,
  connection: RepositoryConnectionRow,
  task: SyncTaskRow,
  token: string
): Promise<SyncTaskRow> {
  if (!task.createIssue || task.externalIssueNumber) return task
  const current = await db.task.findUnique({ where: { id: task.id } })
  if (!current) return task
  if (!current.createIssue || current.externalIssueNumber) return current
  const client = buildProviderClient(connection, token)
  const issue = await client.api.createIssue({
    title: current.title,
    body: current.description ?? "",
  })
  return db.task.update({
    where: { id: current.id },
    data: {
      externalIssueNumber: issue.number,
      externalIssueUrl: issue.url,
      externalUpdatedAt: parseRemoteDate(issue.updatedAt),
    },
  })
}

/** Reports a new task to the repository as an issue. */
export async function pushNewTask(
  db: ProjectDb,
  connection: RepositoryConnectionRow,
  task: SyncTaskRow,
  token: string
): Promise<void> {
  const linked = await ensureIssueForTask(db, connection, task, token)
  const issueNumber = linked.externalIssueNumber
  if (linked.status === "done" && issueNumber) {
    const client = buildProviderClient(connection, token)
    await client.api.updateIssue(issueNumber, { state: "closed" })
  }
}

/** Pushes edited title/description to the linked issue. */
export async function pushTaskContent(
  db: ProjectDb,
  connection: RepositoryConnectionRow,
  task: SyncTaskRow,
  token: string
): Promise<void> {
  const linked = await ensureIssueForTask(db, connection, task, token)
  if (!linked.externalIssueNumber) return
  const client = buildProviderClient(connection, token)
  const issue = await client.api.updateIssue(linked.externalIssueNumber, {
    title: linked.title,
    body: linked.description ?? "",
  })
  // Record the timestamp of our own write so older payloads are ignored.
  await db.task.update({
    where: { id: linked.id },
    data: { externalUpdatedAt: parseRemoteDate(issue.updatedAt) },
  })
}

/**
 * Opens or closes the linked issue to mirror the task status. The target can
 * be overridden so callers can push a status before committing it locally.
 */
export async function pushTaskState(
  db: ProjectDb,
  connection: RepositoryConnectionRow,
  task: SyncTaskRow,
  token: string,
  options: { status?: string } = {}
): Promise<void> {
  const linked = await ensureIssueForTask(db, connection, task, token)
  if (!linked.externalIssueNumber) return
  const client = buildProviderClient(connection, token)
  const issue = await client.api.updateIssue(linked.externalIssueNumber, {
    state: issueStateForStatus(options.status ?? linked.status),
  })
  await db.task.update({
    where: { id: linked.id },
    data: { externalUpdatedAt: parseRemoteDate(issue.updatedAt) },
  })
}

/** Closes the linked issue when its task is deleted, so sync won't resurrect it. */
export async function closeIssueForTask(
  connection: RepositoryConnectionRow,
  issueNumber: number | null,
  token: string
): Promise<void> {
  if (!issueNumber) return
  const client = buildProviderClient(connection, token)
  await client.api.updateIssue(issueNumber, { state: "closed" })
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40)
}

function buildMarkerFile(task: SyncTaskRow): string {
  return [
    `# ${task.identifier}: ${task.title}`,
    "",
    task.description ?? "_No description._",
    "",
    "---",
    "_Created automatically by Asynchrone Space when this task moved to review._",
    "",
  ].join("\n")
}

/**
 * Creates a draft pull/merge request for the task from an `asynchrone-space/<issue>-…`
 * branch (with a marker commit so the PR has content), and stores the link.
 * No-op when a PR is already linked.
 */
export async function ensurePullRequestForTask(
  db: ProjectDb,
  connection: RepositoryConnectionRow,
  task: SyncTaskRow,
  token: string
): Promise<void> {
  if (task.externalPrNumber) return
  const linked = await ensureIssueForTask(db, connection, task, token)
  const issueNumber = linked.externalIssueNumber
  if (!issueNumber) return
  const client = buildProviderClient(connection, token)
  const branch = `asynchrone-space/${issueNumber}-${slugify(linked.title) || "task"}`
  const pullRequest = await client.api.createPullRequest({
    title: `${linked.identifier}: ${linked.title}`,
    body: [
      `Draft opened automatically by Asynchrone Space for **${linked.identifier} — ${linked.title}**.`,
      "",
      `Closes #${issueNumber}`,
      ...(linked.description ? ["", linked.description] : []),
    ].join("\n"),
    branch,
    filePath: `.asynchrone-space/${linked.identifier}.md`,
    fileContent: buildMarkerFile(linked),
  })
  await db.task.update({
    where: { id: linked.id },
    data: {
      externalPrNumber: pullRequest.number,
      externalPrUrl: pullRequest.url,
    },
  })
}

// ---------------------------------------------------------------------------
// Full sync
// ---------------------------------------------------------------------------

/**
 * Bidirectional reconciliation used on connect and by "Sync now"/cron:
 * remote issues are imported or applied to their tasks, then tasks without an
 * issue are reported to the repository.
 */
export async function syncConnection(
  db: ProjectDb,
  connection: RepositoryConnectionRow,
  token: string
): Promise<RepositorySyncSummary> {
  const client = buildProviderClient(connection, token)
  const summary: RepositorySyncSummary = {
    issuesImported: 0,
    issuesUpdated: 0,
    tasksPushed: 0,
  }

  const issues = await client.api.listIssues()
  const linked = await db.task.findMany({
    where: {
      projectId: connection.projectId,
      externalIssueNumber: { not: null },
    },
  })
  const byIssueNumber = new Map(
    linked.map((task) => [task.externalIssueNumber as number, task])
  )

  for (const issue of issues) {
    const task = byIssueNumber.get(issue.number)
    if (!task) {
      if (issue.state === "open") {
        await createTaskFromIssue(db, connection, issue)
        summary.issuesImported += 1
      }
      continue
    }
    const remoteUpdatedAt = parseRemoteDate(issue.updatedAt)
    if (
      remoteUpdatedAt &&
      task.updatedAt.getTime() > remoteUpdatedAt.getTime()
    ) {
      // The local task was edited after this remote revision: heal a push
      // that never landed (provider outage, dropped debounce) instead of
      // letting the stale remote state overwrite it.
      const contentDiffers =
        task.title !== issue.title || (task.description ?? "") !== issue.body
      const stateDiffers =
        (task.status === "done") !== (issue.state === "closed")
      if (contentDiffers) await pushTaskContent(db, connection, task, token)
      if (stateDiffers) await pushTaskState(db, connection, task, token)
      if (contentDiffers || stateDiffers) summary.issuesUpdated += 1
    } else {
      const result = await applyRemoteIssue(db, task, issue)
      if (result === "updated") summary.issuesUpdated += 1
    }
  }

  const unlinked = await db.task.findMany({
    where: {
      projectId: connection.projectId,
      externalIssueNumber: null,
      // Tasks created without issue creation are deliberately local-only.
      createIssue: true,
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  })
  for (const task of unlinked) {
    try {
      await pushNewTask(db, connection, task, token)
      summary.tasksPushed += 1
    } catch (error) {
      logSyncError(`push task ${task.identifier}`, error)
    }
  }

  await db.repositoryConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date() },
  })
  return summary
}
