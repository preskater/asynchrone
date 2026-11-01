import { timingSafeEqual } from "node:crypto"

import type {
  RemoteIssue,
  RemotePullRequest,
  RemoteRepository,
  RepositoryWebhookEvent,
} from "../types"
import {
  RepositoryApiError,
  type ProviderClient,
  type ProviderClientConfig,
} from "./types"

const MAX_ISSUE_PAGES = 5
const PAGE_SIZE = 100
const REQUEST_TIMEOUT_MS = 15_000

interface GitLabIssuePayload {
  iid: number
  title: string
  description: string | null
  state: string
  web_url: string
  updated_at: string
}

/** API base for gitlab.com or a self-managed instance (`/api/v4`). */
export function gitlabApiBase(baseUrl?: string | null) {
  if (!baseUrl) return "https://gitlab.com/api/v4"
  const trimmed = baseUrl.replace(/\/+$/, "")
  return trimmed.endsWith("/api/v4") ? trimmed : `${trimmed}/api/v4`
}

function mapIssue(payload: GitLabIssuePayload): RemoteIssue {
  return {
    number: payload.iid,
    title: payload.title,
    body: payload.description ?? "",
    state: payload.state === "closed" ? "closed" : "open",
    url: payload.web_url,
    updatedAt: payload.updated_at,
  }
}

function passwordsMatch(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected, "utf8")
  const receivedBuffer = Buffer.from(received, "utf8")
  if (expectedBuffer.length !== receivedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

export function createGitLabClient(
  config: ProviderClientConfig
): ProviderClient {
  const baseUrl = gitlabApiBase(config.baseUrl)
  const projectPath = encodeURIComponent(`${config.owner}/${config.repo}`)
  // Personal access tokens authenticate via `PRIVATE-TOKEN`; OAuth tokens
  // (from linked user accounts) only work as Bearer credentials.
  const authHeaders: Record<string, string> = config.accessToken.startsWith(
    "glpat-"
  )
    ? { "PRIVATE-TOKEN": config.accessToken }
    : { Authorization: `Bearer ${config.accessToken}` }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "User-Agent": "Asynchrone Space",
        ...authHeaders,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      const details = await response.text().catch(() => "")
      throw new RepositoryApiError(
        `GitLab request failed (${response.status})`,
        response.status,
        details.slice(0, 500)
      )
    }
    return (await response.json()) as T
  }

  async function listIssues(): Promise<RemoteIssue[]> {
    const issues: RemoteIssue[] = []
    for (let page = 1; page <= MAX_ISSUE_PAGES; page += 1) {
      const payload = await request<GitLabIssuePayload[]>(
        `/projects/${projectPath}/issues?state=all&scope=all&order_by=updated_at&sort=desc&per_page=${PAGE_SIZE}&page=${page}`
      )
      for (const item of payload) {
        issues.push(mapIssue(item))
      }
      if (payload.length < PAGE_SIZE) break
    }
    return issues
  }

  async function getRepository(): Promise<RemoteRepository> {
    const payload = await request<{
      path_with_namespace: string
      web_url: string
      default_branch: string | null
    }>(`/projects/${projectPath}`)
    const parts = payload.path_with_namespace.split("/")
    return {
      owner: parts.slice(0, -1).join("/"),
      repo: parts[parts.length - 1] ?? config.repo,
      url: payload.web_url,
      defaultBranch: payload.default_branch ?? "main",
    }
  }

  async function createIssue(input: {
    title: string
    body: string
  }): Promise<RemoteIssue> {
    const payload = await request<GitLabIssuePayload>(
      `/projects/${projectPath}/issues`,
      {
        method: "POST",
        body: JSON.stringify({ title: input.title, description: input.body }),
      }
    )
    return mapIssue(payload)
  }

  async function updateIssue(
    number: number,
    input: { title?: string; body?: string; state?: "open" | "closed" }
  ): Promise<RemoteIssue> {
    const body: Record<string, unknown> = {}
    if (input.title !== undefined) body.title = input.title
    if (input.body !== undefined) body.description = input.body
    if (input.state === "closed") body.state_event = "close"
    if (input.state === "open") body.state_event = "reopen"
    const payload = await request<GitLabIssuePayload>(
      `/projects/${projectPath}/issues/${number}`,
      { method: "PUT", body: JSON.stringify(body) }
    )
    return mapIssue(payload)
  }

  async function ensureBranch(branch: string, fromRef: string) {
    try {
      await request(`/projects/${projectPath}/repository/branches`, {
        method: "POST",
        body: JSON.stringify({ branch, ref: fromRef }),
      })
    } catch (error) {
      // 400 "Branch already exists" is fine; anything else is fatal.
      if (error instanceof RepositoryApiError && error.status === 400) return
      throw error
    }
  }

  async function commitFile(
    branch: string,
    filePath: string,
    content: string,
    message: string
  ) {
    const commit = (action: "create" | "update") =>
      request(`/projects/${projectPath}/repository/commits`, {
        method: "POST",
        body: JSON.stringify({
          branch,
          commit_message: message,
          actions: [{ action, file_path: filePath, content }],
        }),
      })
    try {
      await commit("create")
    } catch (error) {
      if (!(error instanceof RepositoryApiError) || error.status !== 400) {
        throw error
      }
      // The placeholder file already exists on the branch; update it instead.
      await commit("update")
    }
  }

  async function createPullRequest(input: {
    title: string
    body: string
    branch: string
    filePath: string
    fileContent: string
  }): Promise<RemotePullRequest> {
    const repository = await getRepository()
    await ensureBranch(input.branch, repository.defaultBranch)
    await commitFile(
      input.branch,
      input.filePath,
      input.fileContent,
      `Asynchrone Space: ${input.title}`
    )
    interface GitLabMergeRequest {
      iid: number
      title: string
      description: string | null
      web_url: string
      state: string
      source_branch: string
      target_branch: string
    }
    try {
      const payload = await request<GitLabMergeRequest>(
        `/projects/${projectPath}/merge_requests`,
        {
          method: "POST",
          body: JSON.stringify({
            source_branch: input.branch,
            target_branch: repository.defaultBranch,
            // GitLab has no draft flag; the `Draft:` prefix is the convention.
            title: `Draft: ${input.title}`,
            description: input.body,
          }),
        }
      )
      return {
        number: payload.iid,
        title: payload.title,
        body: payload.description ?? "",
        url: payload.web_url,
        state:
          payload.state === "merged"
            ? "merged"
            : payload.state === "closed"
              ? "closed"
              : "open",
        sourceBranch: payload.source_branch,
        targetBranch: payload.target_branch,
      }
    } catch (error) {
      if (!(error instanceof RepositoryApiError) || error.status !== 409) {
        throw error
      }
      // A merge request for this branch is already open; reuse it.
      const existing = await request<GitLabMergeRequest[]>(
        `/projects/${projectPath}/merge_requests?state=opened&source_branch=${encodeURIComponent(input.branch)}`
      )
      const mergeRequest = existing[0]
      if (!mergeRequest) throw error
      return {
        number: mergeRequest.iid,
        title: mergeRequest.title,
        body: mergeRequest.description ?? "",
        url: mergeRequest.web_url,
        state: "open",
        sourceBranch: mergeRequest.source_branch,
        targetBranch: mergeRequest.target_branch,
      }
    }
  }

  function verifyWebhook(headers: Headers, _rawBody: string) {
    const token = headers.get("x-gitlab-token")
    if (!token) return false
    return passwordsMatch(config.webhookSecret, token)
  }

  function parseWebhook(
    headers: Headers,
    rawBody: string
  ): RepositoryWebhookEvent {
    const event = headers.get("x-gitlab-event")
    if (!event) return { kind: "ignored", reason: "missing x-gitlab-event" }
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return { kind: "ignored", reason: "invalid JSON body" }
    }
    const project = payload.project as
      { path_with_namespace?: string } | undefined
    if (
      project?.path_with_namespace &&
      decodeURIComponent(project.path_with_namespace).toLowerCase() !==
        `${config.owner}/${config.repo}`.toLowerCase()
    ) {
      return { kind: "ignored", reason: "event for another repository" }
    }
    if (event === "Push Hook" || event === "Tag Push Hook") {
      return { kind: "ignored", reason: event }
    }

    if (event === "Issue Hook") {
      const attributes = payload.object_attributes as
        | {
            iid: number
            title: string
            description: string | null
            state: string
            action: string
            url: string
            updated_at: string
          }
        | undefined
      if (!attributes) return { kind: "ignored", reason: "missing issue" }
      const actions: Record<
        string,
        "opened" | "edited" | "closed" | "reopened"
      > = {
        open: "opened",
        update: "edited",
        close: "closed",
        reopen: "reopened",
      }
      const action = actions[attributes.action]
      if (!action) {
        return { kind: "ignored", reason: `issue.${attributes.action}` }
      }
      return {
        kind: "issue",
        action,
        issue: mapIssue({
          iid: attributes.iid,
          title: attributes.title,
          description: attributes.description,
          state: attributes.state,
          web_url: attributes.url,
          updated_at: attributes.updated_at,
        }),
      }
    }

    if (event === "Merge Request Hook") {
      const attributes = payload.object_attributes as
        | {
            iid: number
            title: string
            description: string | null
            state: string
            action: string
            url: string
            source_branch: string
            target_branch: string
          }
        | undefined
      if (!attributes) return { kind: "ignored", reason: "missing MR" }
      let action:
        | Extract<RepositoryWebhookEvent, { kind: "pull_request" }>["action"]
        | null = null
      if (attributes.action === "open") action = "opened"
      else if (attributes.action === "reopen") action = "reopened"
      else if (attributes.action === "update") action = "edited"
      else if (attributes.action === "merge") action = "merged"
      else if (attributes.action === "close") action = "closed"
      if (!action) {
        return { kind: "ignored", reason: `merge_request.${attributes.action}` }
      }
      return {
        kind: "pull_request",
        action,
        pullRequest: {
          number: attributes.iid,
          title: attributes.title,
          body: attributes.description ?? "",
          url: attributes.url,
          state:
            action === "merged"
              ? "merged"
              : attributes.state === "closed"
                ? "closed"
                : "open",
          sourceBranch: attributes.source_branch,
          targetBranch: attributes.target_branch,
        },
      }
    }

    return { kind: "ignored", reason: `unhandled event ${event}` }
  }

  return {
    api: {
      getRepository,
      listIssues,
      createIssue,
      updateIssue,
      createPullRequest,
    },
    verifyWebhook,
    parseWebhook,
  }
}
