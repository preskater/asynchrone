import type { RepositoryProvider } from "@workspace/integrations/types"

export {
  REPOSITORY_PROVIDERS,
  repositoryProviderLabel,
  type RemoteIssue,
  type RemotePullRequest,
  type RemoteRepository,
  type RepositoryProvider,
  type RepositoryWebhookEvent,
} from "@workspace/integrations/types"

/**
 * A repository connection as exposed to the UI. The access token and the
 * webhook secret are never part of this view; the webhook URL is derived from
 * the deployment's `BETTER_AUTH_URL` so the UI can hand it to the provider.
 */
export interface RepositoryConnectionView {
  id: string
  projectId: string
  provider: RepositoryProvider
  owner: string
  repo: string
  repoUrl: string
  /** Self-managed GitLab or GitHub Enterprise instance; absent for the cloud. */
  baseUrl?: string
  webhookUrl: string
  webhookSecret: string
  createdById: string
  lastSyncedAt?: string
  createdAt: string
}

export interface ConnectRepositoryInput {
  projectId: string
  provider: RepositoryProvider
  owner: string
  repo: string
  baseUrl?: string
}

/** A personal access token a user saves in their profile. */
export interface SetUserRepositoryTokenInput {
  provider: RepositoryProvider
  token: string
}

/** Which providers the current user has a personal token for. */
export type UserRepositoryTokenStatus = Record<RepositoryProvider, boolean>

/**
 * Remote references captured when a task is reported to a connected
 * repository; merged into the task row on creation.
 */
export interface TaskExternalLink {
  externalIssueNumber: number
  externalIssueUrl: string
  externalUpdatedAt: Date | null
}

/** Result of a connect/sync run, surfaced to the user as a toast. */
export interface RepositorySyncSummary {
  issuesImported: number
  issuesUpdated: number
  tasksPushed: number
}

export interface ConnectRepositoryResult {
  connection: RepositoryConnectionView
  summary: RepositorySyncSummary
}
