/**
 * Repository integration primitives.
 *
 * The repository connection, its encrypted tokens and the sync/webhook
 * services stay with the owning app (Copilot's `lib/integrations`): a token is
 * never shared across databases. This package only holds the provider
 * protocol, the GitHub/GitLab API clients and the token cipher so every app
 * that owns a connection talks to providers the same way.
 */
export * from "./types"
export { createProviderClient, RepositoryApiError } from "./providers"
export type {
  CreatePullRequestInput,
  ProviderClient,
  ProviderClientConfig,
  RepositoryApi,
} from "./providers"
export { decryptSecret, encryptSecret, generateWebhookSecret } from "./crypto"
