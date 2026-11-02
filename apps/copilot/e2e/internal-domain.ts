/**
 * Constants shared by the e2e bootstrap and the internal-domain spec.
 *
 * Copilot authenticates to the domain apps with its own client-credentials
 * client; the domain apps only need *a* client id/secret pair to boot (they do
 * not sign anyone in during this suite).
 */
export const E2E_COPILOT_OAUTH_CLIENT_ID = "asynchrone-copilot"
export const E2E_COPILOT_OAUTH_CLIENT_SECRET = "e2e-copilot-oauth-client-secret"

export interface E2EDomainApp {
  key: "projects" | "files" | "clients"
  port: number
  clientId: string
  clientSecret: string
}

export const E2E_DOMAIN_APPS: E2EDomainApp[] = [
  {
    key: "projects",
    port: 3004,
    clientId: "e2e-projects-client",
    clientSecret: "e2e-projects-client-secret",
  },
  {
    key: "files",
    port: 3006,
    clientId: "e2e-files-client",
    clientSecret: "e2e-files-client-secret",
  },
  {
    key: "clients",
    port: 3008,
    clientId: "e2e-clients-client",
    clientSecret: "e2e-clients-client-secret",
  },
]

export function domainEnvironment(
  baseUrl: string,
  app: E2EDomainApp
): Record<string, string> {
  const prefix = app.key.toUpperCase()
  return {
    COPILOT_APP_URL: baseUrl,
    [`${prefix}_APP_URL`]: `http://localhost:${app.port}`,
    [`${prefix}_OAUTH_CLIENT_ID`]: app.clientId,
    [`${prefix}_OAUTH_CLIENT_SECRET`]: app.clientSecret,
  }
}
