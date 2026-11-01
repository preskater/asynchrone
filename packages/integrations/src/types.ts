/**
 * Provider protocol shared by the GitHub and GitLab adapters.
 *
 * These types carry no credentials and no database rows: tokens stay in the
 * owning app's database (Copilot today), which is why only the provider
 * clients live in this package.
 */
export const REPOSITORY_PROVIDERS = ["github", "gitlab"] as const

export type RepositoryProvider = (typeof REPOSITORY_PROVIDERS)[number]

const PROVIDER_LABELS: Record<RepositoryProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
}

/** Display name used in error messages and hints. */
export function repositoryProviderLabel(provider: RepositoryProvider) {
  return PROVIDER_LABELS[provider]
}

/** An issue as returned by the provider, normalized across GitHub/GitLab. */
export interface RemoteIssue {
  number: number
  title: string
  body: string
  state: "open" | "closed"
  url: string
  updatedAt: string
}

export interface RemoteRepository {
  owner: string
  repo: string
  url: string
  defaultBranch: string
}

export interface RemotePullRequest {
  number: number
  title: string
  body: string
  url: string
  state: "open" | "closed" | "merged"
  sourceBranch: string
  targetBranch: string
}

/** Normalized webhook event produced by a provider adapter. */
export type RepositoryWebhookEvent =
  | { kind: "ping" }
  | {
      kind: "issue"
      action: "opened" | "edited" | "closed" | "reopened" | "deleted"
      issue: RemoteIssue
    }
  | {
      kind: "pull_request"
      action:
        | "opened"
        | "reopened"
        | "edited"
        | "ready_for_review"
        | "closed"
        | "merged"
      pullRequest: RemotePullRequest
    }
  | { kind: "ignored"; reason: string }
