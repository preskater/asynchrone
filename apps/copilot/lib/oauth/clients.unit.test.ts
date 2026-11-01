import { SERVICE_SCOPES } from "@workspace/contracts"
import { describe, expect, it } from "vitest"

import { buildOAuthClientManifest } from "./clients"

const manifest = buildOAuthClientManifest()
const byKey = new Map(manifest.map((entry) => [entry.key, entry]))

describe("OAuth client manifest", () => {
  it("uses stable, unique client IDs", () => {
    expect(new Set(manifest.map((entry) => entry.clientId)).size).toBe(
      manifest.length
    )
    expect(byKey.get("projects")?.clientId).toBe("asynchrone-projects")
    expect(byKey.get("landing")).toBeUndefined()
  })

  it("registers each domain app for the code flow and service calls", () => {
    const projects = byKey.get("projects")
    expect(projects).toMatchObject({
      redirectUris: ["http://localhost:3004/api/auth/callback"],
      backchannelLogoutUri: "http://localhost:3004/api/auth/backchannel-logout",
      grantTypes: ["authorization_code", "refresh_token", "client_credentials"],
      skipConsent: true,
      enableEndSession: true,
    })
    expect(projects?.resources).toEqual([
      "urn:asynchrone:app:projects",
      "urn:asynchrone:app:copilot",
    ])
    expect(projects?.clientCredentialsScopes).toEqual([
      SERVICE_SCOPES.identityRead,
      SERVICE_SCOPES.notificationsWrite,
    ])
  })

  it("registers the Copilot service client for every domain audience", () => {
    const copilot = byKey.get("copilot")
    expect(copilot?.grantTypes).toEqual(["client_credentials"])
    expect(copilot?.redirectUris).toEqual([])
    expect(copilot?.resources).toEqual([
      "urn:asynchrone:app:projects",
      "urn:asynchrone:app:calendars",
      "urn:asynchrone:app:files",
      "urn:asynchrone:app:messages",
      "urn:asynchrone:app:clients",
      "urn:asynchrone:app:employees",
    ])
    expect(copilot?.clientCredentialsScopes).toContain(
      SERVICE_SCOPES.domainWrite
    )
  })

  it("registers the control tower for identity admin calls", () => {
    const tower = byKey.get("control-tower")
    expect(tower?.resources).toEqual(["urn:asynchrone:app:copilot"])
    expect(tower?.clientCredentialsScopes).toEqual([
      SERVICE_SCOPES.identityRead,
      SERVICE_SCOPES.identityAdmin,
    ])
  })

  it("uses the registry environment names", () => {
    expect(byKey.get("files")).toMatchObject({
      clientIdEnv: "FILES_OAUTH_CLIENT_ID",
      clientSecretEnv: "FILES_OAUTH_CLIENT_SECRET",
    })
  })
})
