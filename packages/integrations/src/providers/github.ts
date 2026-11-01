import { createHmac, timingSafeEqual } from "node:crypto"

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

interface GitHubIssuePayload {
  number: number
  title: string
  body: string | null
  state: string
  html_url: string
  updated_at: string
  pull_request?: unknown
}

/**
 * API base for github.com or a GitHub Enterprise instance. Enterprise REST
 * lives under `/api/v3`; admins may enter the instance root or the full API
 * URL (both are accepted).
 */
export function githubApiBase(baseUrl?: string | null) {
  if (!baseUrl) return "https://api.github.com"
  const trimmed = baseUrl.replace(/\/+$/, "")
  return trimmed.endsWith("/api/v3") ? trimmed : `${trimmed}/api/v3`
}

function mapIssue(payload: GitHubIssuePayload): RemoteIssue {
  return {
    number: payload.number,
    title: payload.title,
    body: payload.body ?? "",
    state: payload.state === "closed" ? "closed" : "open",
    url: payload.html_url,
    updatedAt: payload.updated_at,
  }
}

function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/)
    if (match) return match[1] ?? null
  }
  return null
}

export function createGitHubClient(
  config: ProviderClientConfig
): ProviderClient {
  const baseUrl = githubApiBase(config.baseUrl)

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(
      path.startsWith("http") ? path : `${baseUrl}${path}`,
      {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Asynchrone Space",
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    )
    if (!response.ok) {
      const details = await response.text().catch(() => "")
      throw new RepositoryApiError(
        `GitHub request failed (${response.status})`,
        response.status,
        details.slice(0, 500)
      )
    }
    return (await response.json()) as T
  }

  async function listIssues(): Promise<RemoteIssue[]> {
    const issues: RemoteIssue[] = []
    let next: string | null =
      `/repos/${config.owner}/${config.repo}/issues?state=all&sort=updated&direction=desc&per_page=${PAGE_SIZE}`
    for (let page = 0; page < MAX_ISSUE_PAGES && next; page += 1) {
      const url = next.startsWith("http") ? next : `${baseUrl}${next}`
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Asynchrone Space",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) {
        const details = await response.text().catch(() => "")
        throw new RepositoryApiError(
          `GitHub request failed (${response.status})`,
          response.status,
          details.slice(0, 500)
        )
      }
      const payload = (await response.json()) as GitHubIssuePayload[]
      for (const item of payload) {
        // The issues endpoint also returns pull requests; only issues sync.
        if (item.pull_request) continue
        issues.push(mapIssue(item))
      }
      next = nextLink(response.headers.get("link"))
    }
    return issues
  }

  async function getRepository(): Promise<RemoteRepository> {
    const payload = await request<{
      full_name: string
      html_url: string
      default_branch: string
    }>(`/repos/${config.owner}/${config.repo}`)
    return {
      owner: payload.full_name.split("/")[0] ?? config.owner,
      repo: payload.full_name.split("/")[1] ?? config.repo,
      url: payload.html_url,
      defaultBranch: payload.default_branch,
    }
  }

  async function createIssue(input: {
    title: string
    body: string
  }): Promise<RemoteIssue> {
    const payload = await request<GitHubIssuePayload>(
      `/repos/${config.owner}/${config.repo}/issues`,
      { method: "POST", body: JSON.stringify(input) }
    )
    return mapIssue(payload)
  }

  async function updateIssue(
    number: number,
    input: { title?: string; body?: string; state?: "open" | "closed" }
  ): Promise<RemoteIssue> {
    const payload = await request<GitHubIssuePayload>(
      `/repos/${config.owner}/${config.repo}/issues/${number}`,
      { method: "PATCH", body: JSON.stringify(input) }
    )
    return mapIssue(payload)
  }

  /** Creates the head branch from the default branch; no-op if it exists. */
  async function ensureBranch(branch: string, fromSha: string) {
    try {
      await request(`/repos/${config.owner}/${config.repo}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
      })
    } catch (error) {
      if (error instanceof RepositoryApiError && error.status === 422) return
      throw error
    }
  }

  /**
   * Commits the placeholder file on the branch. When the file already exists
   * (e.g. a previous attempt), the update requires the current blob sha.
   */
  async function commitFile(
    branch: string,
    filePath: string,
    content: string,
    message: string
  ) {
    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
    }
    try {
      await request(
        `/repos/${config.owner}/${config.repo}/contents/${filePath}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        }
      )
    } catch (error) {
      if (!(error instanceof RepositoryApiError) || error.status !== 422)
        throw error
      const existing = await request<{ sha: string }>(
        `/repos/${config.owner}/${config.repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`
      )
      await request(
        `/repos/${config.owner}/${config.repo}/contents/${filePath}`,
        {
          method: "PUT",
          body: JSON.stringify({ ...body, sha: existing.sha }),
        }
      )
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
    const ref = await request<{ object: { sha: string } }>(
      `/repos/${config.owner}/${config.repo}/git/ref/heads/${repository.defaultBranch}`
    )
    await ensureBranch(input.branch, ref.object.sha)
    await commitFile(
      input.branch,
      input.filePath,
      input.fileContent,
      `Asynchrone Space: ${input.title}`
    )
    try {
      const payload = await request<{
        number: number
        title: string
        body: string | null
        html_url: string
        state: string
        merged_at: string | null
        head: { ref: string }
        base: { ref: string }
      }>(`/repos/${config.owner}/${config.repo}/pulls`, {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          head: input.branch,
          base: repository.defaultBranch,
          draft: true,
        }),
      })
      return {
        number: payload.number,
        title: payload.title,
        body: payload.body ?? "",
        url: payload.html_url,
        state: payload.merged_at
          ? "merged"
          : payload.state === "closed"
            ? "closed"
            : "open",
        sourceBranch: payload.head.ref,
        targetBranch: payload.base.ref,
      }
    } catch (error) {
      if (!(error instanceof RepositoryApiError) || error.status !== 422)
        throw error
      // A pull request for this branch is already open; reuse it.
      const existing = await request<
        Array<{
          number: number
          title: string
          body: string | null
          html_url: string
          state: string
          head: { ref: string }
          base: { ref: string }
        }>
      >(
        `/repos/${config.owner}/${config.repo}/pulls?state=open&head=${encodeURIComponent(`${config.owner}:${input.branch}`)}`
      )
      const pull = existing[0]
      if (!pull) throw error
      return {
        number: pull.number,
        title: pull.title,
        body: pull.body ?? "",
        url: pull.html_url,
        state: pull.state === "closed" ? "closed" : "open",
        sourceBranch: pull.head.ref,
        targetBranch: pull.base.ref,
      }
    }
  }

  function verifyWebhook(headers: Headers, rawBody: string) {
    const signature = headers.get("x-hub-signature-256")
    if (!signature?.startsWith("sha256=")) return false
    const expected = createHmac("sha256", config.webhookSecret)
      .update(rawBody)
      .digest("hex")
    const received = signature.slice("sha256=".length)
    const expectedBuffer = Buffer.from(expected, "hex")
    const receivedBuffer = Buffer.from(received, "hex")
    if (expectedBuffer.length !== receivedBuffer.length) return false
    return timingSafeEqual(expectedBuffer, receivedBuffer)
  }

  function parseWebhook(
    headers: Headers,
    rawBody: string
  ): RepositoryWebhookEvent {
    const event = headers.get("x-github-event")
    if (!event) return { kind: "ignored", reason: "missing x-github-event" }
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return { kind: "ignored", reason: "invalid JSON body" }
    }
    const repository = payload.repository as { full_name?: string } | undefined
    if (
      repository?.full_name &&
      repository.full_name.toLowerCase() !==
        `${config.owner}/${config.repo}`.toLowerCase()
    ) {
      return { kind: "ignored", reason: "event for another repository" }
    }
    if (event === "ping") return { kind: "ping" }

    const action = typeof payload.action === "string" ? payload.action : ""

    if (event === "issues") {
      const issue = payload.issue as GitHubIssuePayload | undefined
      if (!issue) return { kind: "ignored", reason: "missing issue payload" }
      switch (action) {
        case "opened":
        case "edited":
        case "closed":
        case "reopened":
        case "deleted":
          return { kind: "issue", action, issue: mapIssue(issue) }
        default:
          return { kind: "ignored", reason: `issues.${action}` }
      }
    }

    if (event === "pull_request") {
      const pull = payload.pull_request as
        | {
            number: number
            title: string
            body: string | null
            html_url: string
            state: string
            merged: boolean | null
            head: { ref: string }
            base: { ref: string }
          }
        | undefined
      if (!pull) return { kind: "ignored", reason: "missing pull_request" }
      let mapped:
        | Extract<RepositoryWebhookEvent, { kind: "pull_request" }>["action"]
        | null = null
      if (action === "opened") mapped = "opened"
      else if (action === "reopened") mapped = "reopened"
      else if (action === "edited") mapped = "edited"
      else if (action === "ready_for_review") mapped = "ready_for_review"
      else if (action === "closed") mapped = pull.merged ? "merged" : "closed"
      if (!mapped) return { kind: "ignored", reason: `pull_request.${action}` }
      return {
        kind: "pull_request",
        action: mapped,
        pullRequest: {
          number: pull.number,
          title: pull.title,
          body: pull.body ?? "",
          url: pull.html_url,
          state:
            pull.merged || action === "merged"
              ? "merged"
              : pull.state === "closed"
                ? "closed"
                : "open",
          sourceBranch: pull.head.ref,
          targetBranch: pull.base.ref,
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
