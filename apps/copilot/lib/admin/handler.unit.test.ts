import { describe, expect, it, vi } from "vitest"

import { handleAdminRequest } from "./handler"
import type { AdminRepository } from "./repository"

const organization = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  plan: "team" as const,
  subscriptionStatus: "active",
  manualOverride: true,
  trialEndsAt: null,
  deletionScheduledAt: null,
  memberCount: 4,
  storageQuotaBytes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
}

const user = {
  id: "user_1",
  name: "Ada",
  email: "ada@example.com",
  emailVerified: true,
  role: "platform_admin",
  banned: false,
  banReason: null,
  twoFactorEnabled: true,
  lastSeenAt: null,
  organizationCount: 2,
  lastSessionAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
}

const oauthClient = {
  clientId: "client_1",
  name: "MCP",
  disabled: false,
  userId: "user_1",
  referenceId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
}

const supportTicket = {
  id: "ticket_1",
  number: 1,
  status: "open" as const,
  organizationId: "org_1",
  organizationName: "Acme",
  organizationSlug: "acme",
  plan: "team",
  userId: "user_1",
  userName: "Ada",
  category: "bug",
  impact: "high",
  title: "Upload fails",
  description: "The upload never completes.",
  contactEmail: "ada@example.com",
  allowContact: true,
  details: {},
  context: { buildSha: "abc123" },
  assigneeEmail: null,
  acknowledgedAt: null,
  resolvedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

function repository(): AdminRepository {
  return {
    listOrganizations: vi.fn(async () => ({
      items: [organization],
      nextCursor: null,
      total: 1,
    })),
    getOrganization: vi.fn(async (id) =>
      id === "org_1" ? organization : null
    ),
    getOrganizationDetail: vi.fn(async (id) =>
      id === "org_1"
        ? {
            ...organization,
            trialStartedAt: null,
            subscription: null,
            seatCount: 2,
            members: [],
            oauthClients: [oauthClient],
            recentAudit: [],
            aiUsage: {
              costMicros: 0,
              inputTokens: 0,
              outputTokens: 0,
              runs: 0,
            },
            previousMonthAiCostMicros: 0,
          }
        : null
    ),
    updatePlan: vi.fn(async () => organization),
    releasePlan: vi.fn(async () => organization),
    setTrial: vi.fn(async () => organization),
    listUsers: vi.fn(async () => ({
      items: [user],
      nextCursor: null,
      total: 1,
    })),
    getUser: vi.fn(async (id) => (id === "user_1" ? user : null)),
    getUserDetail: vi.fn(async (id) =>
      id === "user_1"
        ? {
            ...user,
            memberships: [],
            sessions: [],
            accounts: [],
            oauthClients: [oauthClient],
          }
        : null
    ),
    setBan: vi.fn(async () => ({ ...user, banned: true })),
    revokeSessions: vi.fn(async () => ({ deleted: 2 })),
    createHandoff: vi.fn(async () => ({
      url: "https://copilot.example/api/platform/handoff?token=t",
    })),
    overview: vi.fn(async () => ({
      organizations: 1,
      users: 1,
      activeSessions: 1,
      newestOrganizations: [organization],
    })),
    ops: vi.fn(async () => ({
      sessions: { active: 1, expired: 0 },
      invitations: { pending: 0 },
      signingKeys: [],
      oauthClients: { total: 1, disabled: 0 },
      aiUsage: {
        costMicros: 0,
        inputTokens: 0,
        outputTokens: 0,
        runs: 0,
        windowDays: 30,
      },
    })),
    listAudit: vi.fn(async () => ({
      items: [
        {
          id: "audit_1",
          organizationId: "org_1",
          organizationName: "Acme",
          action: "task.create",
          entityType: "task",
          entityId: "task_1",
          entityLabel: "ABC-1",
          actorId: "user_1",
          actorName: "Ada",
          actorEmail: "ada@example.com",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    })),
    getOAuthClient: vi.fn(async (clientId) =>
      clientId === "client_1" ? oauthClient : null
    ),
    setOAuthClientDisabled: vi.fn(async (_clientId, input) => ({
      ...oauthClient,
      disabled: input.disabled,
    })),
    listSupportTickets: vi.fn(async () => ({ items: [supportTicket] })),
    getSupportTicket: vi.fn(async (id) =>
      id === "ticket_1" ? supportTicket : null
    ),
    updateSupportTicket: vi.fn(async (id, input) =>
      id === "ticket_1"
        ? {
            ...supportTicket,
            status: input.status ?? supportTicket.status,
            assigneeEmail:
              input.assigneeEmail === undefined
                ? supportTicket.assigneeEmail
                : input.assigneeEmail,
          }
        : null
    ),
  }
}

async function call(
  segments: string[],
  method = "GET",
  body?: unknown,
  authorize: () => Promise<unknown> = async () => undefined
) {
  return handleAdminRequest({
    segments,
    request: new Request("https://copilot.example/internal/v1/admin/x", {
      method,
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }),
    }),
    authorize,
    repository: repository(),
  })
}

describe("admin handler", () => {
  it("lists organizations and users", async () => {
    const organizations = await call(["organizations"])
    expect((await organizations.json()).data.items[0].id).toBe("org_1")

    const users = await call(["users"])
    expect((await users.json()).data.items[0].id).toBe("user_1")
  })

  it("returns 404 for an unknown entity", async () => {
    expect((await call(["organizations", "missing"])).status).toBe(404)
    expect((await call(["users", "missing"])).status).toBe(404)
  })

  it("changes a plan, bans a user and creates a handoff", async () => {
    const plan = await call(["organizations", "org_1", "plan"], "POST", {
      plan: "enterprise",
      quotaBytes: 1000,
    })
    expect(plan.status).toBe(200)

    const ban = await call(["users", "user_1", "ban"], "POST", {
      banned: true,
      reason: "abuse",
    })
    expect((await ban.json()).data.banned).toBe(true)

    const handoff = await call(["handoffs"], "POST", {
      userId: "user_1",
    })
    expect((await handoff.json()).data.url).toContain("/api/platform/handoff")
  })

  it("serves the control-tower read models", async () => {
    const overview = await call(["overview"])
    expect((await overview.json()).data.organizations).toBe(1)

    const ops = await call(["ops"])
    expect((await ops.json()).data.sessions.active).toBe(1)

    const audit = await call(["audit"])
    expect((await audit.json()).data.items[0].organizationName).toBe("Acme")

    const organization = await call(["organizations", "org_1", "detail"])
    expect((await organization.json()).data.oauthClients[0].clientId).toBe(
      "client_1"
    )

    const user = await call(["users", "user_1", "detail"])
    expect((await user.json()).data.organizationCount).toBe(2)

    const toggled = await call(["oauth-clients", "client_1"], "POST", {
      disabled: true,
    })
    expect((await toggled.json()).data.disabled).toBe(true)
  })

  it("lists, reads and updates support tickets", async () => {
    const list = await call(["support-tickets"])
    expect((await list.json()).data.items[0].number).toBe(1)

    const ticket = await call(["support-tickets", "ticket_1"])
    expect((await ticket.json()).data.context.buildSha).toBe("abc123")

    const updated = await call(["support-tickets", "ticket_1"], "POST", {
      status: "acknowledged",
      assigneeEmail: "ops@example.com",
    })
    const data = (await updated.json()).data
    expect(data.status).toBe("acknowledged")
    expect(data.assigneeEmail).toBe("ops@example.com")

    expect((await call(["support-tickets", "missing"])).status).toBe(404)
    expect(
      (await call(["support-tickets", "ticket_1"], "POST", {})).status
    ).toBe(400)
    expect(
      (
        await call(["support-tickets", "ticket_1"], "POST", {
          status: "closed",
        })
      ).status
    ).toBe(400)
  })

  it("rejects an invalid body and a missing token", async () => {
    expect(
      (await call(["organizations", "org_1", "plan"], "POST", { plan: "x" }))
        .status
    ).toBe(400)

    const unauthorized = await call(
      ["organizations"],
      "GET",
      undefined,
      async () => {
        throw Object.assign(new Error("no"), {
          status: 403,
          code: "insufficient_scope",
          message: "No admin scope",
        })
      }
    )
    expect(unauthorized.status).toBe(403)
  })
})
