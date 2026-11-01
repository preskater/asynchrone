import type {
  RemoteIssue,
  RemotePullRequest,
  RemoteRepository,
  RepositoryProvider,
  RepositoryWebhookEvent,
} from "../types"

/** Connection fields needed to talk to a provider API. */
export interface ProviderClientConfig {
  provider: RepositoryProvider
  /** Instance URL for self-managed GitLab / GitHub Enterprise; null = cloud. */
  baseUrl?: string | null
  owner: string
  repo: string
  accessToken: string
  webhookSecret: string
}

export interface CreateIssueInput {
  title: string
  body: string
}

export interface UpdateIssueInput {
  title?: string
  body?: string
  state?: "open" | "closed"
}

export interface CreatePullRequestInput {
  title: string
  body: string
  /** Head branch to create; the provider creates it from the default branch. */
  branch: string
  /** File committed on the branch so the pull request has content. */
  filePath: string
  fileContent: string
}

/** Provider-agnostic repository API used by the sync service. */
export interface RepositoryApi {
  getRepository(): Promise<RemoteRepository>
  /** All issues (open + closed), most recently updated first. */
  listIssues(): Promise<RemoteIssue[]>
  createIssue(input: CreateIssueInput): Promise<RemoteIssue>
  updateIssue(number: number, input: UpdateIssueInput): Promise<RemoteIssue>
  createPullRequest(input: CreatePullRequestInput): Promise<RemotePullRequest>
}

export interface ProviderClient {
  api: RepositoryApi
  /** Verifies the webhook signature against the connection's secret. */
  verifyWebhook(headers: Headers, rawBody: string): boolean
  /** Parses and normalizes a webhook payload for this connection. */
  parseWebhook(headers: Headers, rawBody: string): RepositoryWebhookEvent
}

export class RepositoryApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: string
  ) {
    super(message)
    this.name = "RepositoryApiError"
  }
}
