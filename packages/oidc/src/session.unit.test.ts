import { describe, expect, it, vi } from "vitest"

import type { OidcConfig } from "./config"
import type { AccessTokenClaims } from "./jwks"
import {
  IMPERSONATION_TTL_MS,
  MemorySessionStore,
  createSession,
  impersonationExpired,
  resolveSession,
  sessionClaimMismatch,
  sessionRecordFromTokens,
} from "./session"

const config: OidcConfig = {
  issuer: "https://copilot.asynchrone.space",
  clientId: "projects",
  clientSecret: "secret",
  redirectUri: "https://projects.copilot.asynchrone.space/api/auth/callback",
  resource: "urn:asynchrone:app:projects",
}

const tokens = {
  access_token: "access_1",
  token_type: "Bearer",
  expires_in: 900,
  expires_at: 1_900_000,
  refresh_token: "refresh_1",
}

function claims(overrides: Partial<AccessTokenClaims> = {}): AccessTokenClaims {
  return { sub: "user_1", sid: "sid_1", org: "org_1", ...overrides }
}

describe("OIDC sessions", () => {
  it("creates a session from a token response", async () => {
    const store = new MemorySessionStore()
    const session = await createSession(store, {
      tokens,
      userId: "user_1",
      organizationId: "org_1",
      sid: "sid_1",
      id: "session_1",
      now: 1_000,
    })
    expect(session).toMatchObject({
      id: "session_1",
      userId: "user_1",
      organizationId: "org_1",
      sid: "sid_1",
      accessToken: "access_1",
      refreshToken: "refresh_1",
    })
    expect(await store.get("session_1")).toEqual(session)
  })

  it("returns a valid session without refreshing", async () => {
    const store = new MemorySessionStore()
    const record = sessionRecordFromTokens({
      tokens,
      userId: "user_1",
      organizationId: "org_1",
      sid: "sid_1",
      id: "session_1",
    })
    record.accessTokenExpiresAt = 100_000
    await store.create(record)
    const fetchImpl = vi.fn()
    const resolved = await resolveSession(store, config, "session_1", {
      fetchImpl: fetchImpl as typeof fetch,
      now: 1_000,
      verify: async () => claims(),
    })
    expect(resolved?.accessToken).toBe("access_1")
    expect(resolved?.claims).toMatchObject({ org: "org_1" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("refreshes an expired access token and rotates the refresh token", async () => {
    const store = new MemorySessionStore()
    const record = sessionRecordFromTokens({
      tokens,
      userId: "user_1",
      organizationId: "org_1",
      sid: "sid_1",
      id: "session_1",
    })
    record.accessTokenExpiresAt = 1_000
    await store.create(record)

    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "access_2",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "refresh_2",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    )

    const resolved = await resolveSession(store, config, "session_1", {
      fetchImpl: fetchImpl as typeof fetch,
      now: 2_000,
      verify: async () => claims(),
    })
    expect(resolved).toMatchObject({
      accessToken: "access_2",
      refreshToken: "refresh_2",
      accessTokenExpiresAt: 902_000,
    })
    expect(await store.get("session_1")).toMatchObject({
      accessToken: "access_2",
      refreshToken: "refresh_2",
    })
  })

  it("deletes the local session when refresh fails", async () => {
    const store = new MemorySessionStore()
    const record = sessionRecordFromTokens({
      tokens,
      userId: "user_1",
      organizationId: "org_1",
      sid: "sid_1",
      id: "session_1",
    })
    record.accessTokenExpiresAt = 1_000
    await store.create(record)

    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
    )

    expect(
      await resolveSession(store, config, "session_1", {
        fetchImpl: fetchImpl as typeof fetch,
        now: 2_000,
        verify: async () => claims(),
      })
    ).toBeNull()
    expect(await store.get("session_1")).toBeNull()
  })

  it("deletes the session when the access token was minted for another app", async () => {
    const store = new MemorySessionStore()
    const record = sessionRecordFromTokens({
      tokens,
      userId: "user_1",
      organizationId: "org_1",
      sid: "sid_1",
      id: "session_1",
    })
    record.accessTokenExpiresAt = 100_000
    await store.create(record)

    const resolved = await resolveSession(store, config, "session_1", {
      now: 1_000,
      verify: async () => {
        throw new Error("unexpected audience")
      },
    })
    expect(resolved).toBeNull()
    expect(await store.get("session_1")).toBeNull()
  })

  it("deletes the session when a refreshed token belongs to another organization", async () => {
    const store = new MemorySessionStore()
    const record = sessionRecordFromTokens({
      tokens,
      userId: "user_1",
      organizationId: "org_1",
      sid: "sid_1",
      id: "session_1",
    })
    record.accessTokenExpiresAt = 1_000
    await store.create(record)

    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "access_2",
            token_type: "Bearer",
            expires_in: 900,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    )

    const resolved = await resolveSession(store, config, "session_1", {
      fetchImpl: fetchImpl as typeof fetch,
      now: 2_000,
      verify: async () => claims({ org: "org_2" }),
    })
    expect(resolved).toBeNull()
    expect(await store.get("session_1")).toBeNull()
  })

  it("deletes the session when the token is bound to another sign-in", async () => {
    const store = new MemorySessionStore()
    const record = sessionRecordFromTokens({
      tokens,
      userId: "user_1",
      organizationId: "org_1",
      sid: "sid_1",
      id: "session_1",
    })
    record.accessTokenExpiresAt = 100_000
    await store.create(record)

    expect(
      await resolveSession(store, config, "session_1", {
        now: 1_000,
        verify: async () => claims({ sid: "sid_2" }),
      })
    ).toBeNull()
    expect(await store.get("session_1")).toBeNull()
  })

  it("deletes sessions by Copilot sid", async () => {
    const store = new MemorySessionStore()
    await store.create(
      sessionRecordFromTokens({
        tokens,
        userId: "user_1",
        organizationId: "org_1",
        sid: "sid_1",
        id: "session_1",
      })
    )
    await store.deleteBySid("sid_1")
    expect(await store.get("session_1")).toBeNull()
  })
})

describe("session claim binding", () => {
  const record = { userId: "user_1", organizationId: "org_1", sid: "sid_1" }

  it("accepts matching subject, sid and organization", () => {
    expect(sessionClaimMismatch(claims(), record)).toBeNull()
    expect(
      sessionClaimMismatch(
        claims({ org: undefined, organizationId: "org_1" }),
        record
      )
    ).toBeNull()
  })

  it("rejects a different user, sign-in or organization", () => {
    expect(sessionClaimMismatch(claims({ sub: "user_2" }), record)).toBe(
      "subject_mismatch"
    )
    expect(sessionClaimMismatch(claims({ sid: "sid_2" }), record)).toBe(
      "sid_mismatch"
    )
    expect(sessionClaimMismatch(claims({ org: "org_2" }), record)).toBe(
      "organization_mismatch"
    )
    expect(sessionClaimMismatch(claims({ org: undefined }), record)).toBe(
      "organization_mismatch"
    )
  })
})

describe("impersonation TTL", () => {
  it("does not expire a normal session", () => {
    expect(
      impersonationExpired({
        impersonatedBy: null,
        createdAt: 0,
        now: IMPERSONATION_TTL_MS * 10,
      })
    ).toBe(false)
  })

  it("expires an impersonation one hour after the Copilot session started", () => {
    const createdAt = Date.UTC(2026, 0, 2, 3, 4, 5)
    expect(
      impersonationExpired({
        impersonatedBy: "platform_admin_1",
        createdAt,
        now: createdAt + IMPERSONATION_TTL_MS - 1,
      })
    ).toBe(false)
    expect(
      impersonationExpired({
        impersonatedBy: "platform_admin_1",
        createdAt,
        now: createdAt + IMPERSONATION_TTL_MS,
      })
    ).toBe(true)
  })
})
