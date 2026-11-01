import { describe, expect, it, vi } from "vitest"

import { IdentityAdminClient } from "./identity-admin"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const organization = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  plan: "team",
  subscriptionStatus: "active",
  manualOverride: true,
  trialEndsAt: null,
  deletionScheduledAt: null,
  memberCount: 3,
  storageQuotaBytes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
}

const user = {
  id: "user_1",
  name: "Ada",
  email: "ada@example.com",
  emailVerified: true,
  role: null,
  banned: false,
  banReason: null,
  twoFactorEnabled: false,
  lastSeenAt: null,
  organizationCount: 1,
  lastSessionAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
}

describe("identity admin client", () => {
  it("lists organizations with the admin scope", async () => {
    const token = vi.fn(async () => "admin-token")
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://copilot.example/internal/v1/admin/organizations?query=acme&limit=10"
      )
      return json({
        data: { items: [organization], nextCursor: null, total: 1 },
      })
    })
    const client = new IdentityAdminClient({
      baseUrl: "https://copilot.example",
      getToken: token,
      fetchImpl: fetchImpl as typeof fetch,
    })

    const page = await client.listOrganizations({ query: "acme", limit: 10 })
    expect(page.items[0]?.plan).toBe("team")
    expect(token).toHaveBeenCalledWith({
      audience: "urn:asynchrone:app:copilot",
      scopes: ["internal:identity:admin"],
    })
  })

  it("updates a plan and creates a handoff", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/handoffs")) {
          expect(JSON.parse(String(init?.body))).toMatchObject({
            userId: "user_1",
          })
          return json({
            data: {
              url: "https://copilot.example/api/platform/handoff?token=t",
            },
          })
        }
        expect(JSON.parse(String(init?.body))).toMatchObject({
          plan: "enterprise",
        })
        return json({ data: organization })
      }
    )
    const client = new IdentityAdminClient({
      baseUrl: "https://copilot.example",
      getToken: async () => "token",
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(
      client.updatePlan("org_1", { plan: "enterprise", quotaBytes: null })
    ).resolves.toMatchObject({ id: "org_1" })
    await expect(
      client.createHandoff({ userId: "user_1" })
    ).resolves.toMatchObject({ url: expect.stringContaining("handoff") })
  })

  it("fetches the detail and platform read models", async () => {
    const requests: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (url.includes("/organizations/org_1/detail")) {
        return json({
          data: {
            ...organization,
            trialStartedAt: null,
            subscription: null,
            seatCount: 1,
            members: [],
            oauthClients: [],
            recentAudit: [],
            aiUsage: {
              costMicros: 0,
              inputTokens: 0,
              outputTokens: 0,
              runs: 0,
            },
            previousMonthAiCostMicros: 0,
          },
        })
      }
      if (url.includes("/users/user_1/detail")) {
        return json({
          data: {
            ...user,
            memberships: [],
            sessions: [],
            accounts: [],
            oauthClients: [],
          },
        })
      }
      if (url.includes("/admin/overview")) {
        return json({
          data: {
            organizations: 1,
            users: 1,
            activeSessions: 0,
            newestOrganizations: [organization],
          },
        })
      }
      if (url.includes("/admin/ops")) {
        return json({
          data: {
            sessions: { active: 0, expired: 0 },
            invitations: { pending: 0 },
            signingKeys: [],
            oauthClients: { total: 0, disabled: 0 },
            aiUsage: {
              costMicros: 0,
              inputTokens: 0,
              outputTokens: 0,
              runs: 0,
              windowDays: 30,
            },
          },
        })
      }
      if (url.includes("/admin/audit")) {
        return json({ data: { items: [] } })
      }
      return json({
        data: {
          clientId: "client_1",
          name: "MCP",
          disabled: true,
          userId: null,
          referenceId: null,
          createdAt: null,
        },
      })
    })
    const client = new IdentityAdminClient({
      baseUrl: "https://copilot.example",
      getToken: async () => "token",
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(client.getOrganizationDetail("org_1")).resolves.toMatchObject({
      id: "org_1",
    })
    await expect(client.getUserDetail("user_1")).resolves.toMatchObject({
      id: "user_1",
    })
    await expect(client.overview()).resolves.toMatchObject({ users: 1 })
    await expect(client.ops()).resolves.toMatchObject({ signingKeys: [] })
    await expect(client.listAudit({ limit: 5 })).resolves.toEqual({ items: [] })
    await expect(
      client.setOAuthClientDisabled("client_1", { disabled: true })
    ).resolves.toMatchObject({ disabled: true })
    expect(
      requests.some((url) => url.includes("/admin/oauth-clients/client_1"))
    ).toBe(true)
  })

  it("maps an API error", async () => {
    const client = new IdentityAdminClient({
      baseUrl: "https://copilot.example",
      getToken: async () => "token",
      fetchImpl: (async () =>
        json(
          { error: { code: "forbidden", message: "No" } },
          403
        )) as typeof fetch,
    })
    await expect(client.getUser("user_1")).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    })
  })
})
