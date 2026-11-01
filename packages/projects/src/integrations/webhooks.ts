import type { ProjectDb } from "../db"

import type { RepositoryConnectionRepository } from "./repository"
import {
  applyIssueEvent,
  applyPullRequestEvent,
  buildProviderClient,
} from "./sync"

export interface WebhookResult {
  status: number
  body: Record<string, unknown>
}

/**
 * Entry point for `POST /api/webhooks/repositories/[connectionId]`.
 *
 * The connection is resolved from the URL (so GitHub and GitLab webhooks can
 * share one route), the signature/token is verified against the connection's
 * secret, then the payload is applied to tasks. No API token is needed here:
 * webhook handling only writes to the local database. Processing errors
 * return 500 so the provider retries; ignored events return 200 so it doesn't.
 */
export class RepositoryWebhookHandler {
  constructor(
    private readonly repo: RepositoryConnectionRepository,
    private readonly db: ProjectDb
  ) {}

  async handle(params: {
    connectionId: string
    headers: Headers
    rawBody: string
  }): Promise<WebhookResult> {
    const connection = await this.repo.findById(params.connectionId)
    if (!connection) {
      return { status: 404, body: { error: "Unknown repository connection." } }
    }

    const client = buildProviderClient(connection, "")
    if (!client.verifyWebhook(params.headers, params.rawBody)) {
      return { status: 401, body: { error: "Invalid webhook signature." } }
    }

    const event = client.parseWebhook(params.headers, params.rawBody)
    try {
      switch (event.kind) {
        case "ping":
          return { status: 200, body: { ok: true, event: "ping" } }
        case "issue":
          await applyIssueEvent(this.db, connection, event)
          return { status: 200, body: { ok: true, event: "issue" } }
        case "pull_request":
          await applyPullRequestEvent(this.db, connection, event.pullRequest)
          return { status: 200, body: { ok: true, event: "pull_request" } }
        default:
          return { status: 200, body: { ok: true, ignored: event.reason } }
      }
    } catch (error) {
      console.error("[repository-sync] webhook processing failed", error)
      return { status: 500, body: { error: "Webhook processing failed." } }
    }
  }
}
