import { describe, expect, it } from "vitest"

import { MemorySessionStore, type OidcConfig } from "@workspace/oidc"

import { createOidcSessionReader } from "./oidc"

const config: OidcConfig = {
  issuer: "https://copilot.example",
  clientId: "asynchrone-projects",
  clientSecret: "secret",
  redirectUri: "https://projects.example/api/auth/callback",
  resource: "https://projects.example",
}

describe("createOidcSessionReader", () => {
  it("reads the app's host-only session cookie", async () => {
    const store = new MemorySessionStore()
    const now = Date.now()
    await store.create({
      id: "session_1",
      userId: "user_1",
      organizationId: "org_1",
      sid: "copilot_sid",
      accessToken: "access",
      refreshToken: null,
      accessTokenExpiresAt: now + 60_000,
      createdAt: now,
      updatedAt: now,
    })

    const reader = createOidcSessionReader({ store, config })
    const session = await reader.resolve("__Host-asynchrone_session=session_1")
    expect(session).toMatchObject({
      userId: "user_1",
      organizationId: "org_1",
    })
  })

  it("ignores another app's cookie and a missing cookie", async () => {
    const reader = createOidcSessionReader({
      store: new MemorySessionStore(),
      config,
    })
    expect(await reader.resolve("other_session=session_1")).toBeNull()
    expect(await reader.resolve(null)).toBeNull()
  })
})
