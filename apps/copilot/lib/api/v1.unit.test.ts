import { beforeEach, describe, expect, it, vi } from "vitest"

import { DomainClientError } from "@workspace/contracts"
import { AppError, UnauthorizedError } from "@workspace/core/errors"

const verify = vi.hoisted(() => vi.fn())
const plan = vi.hoisted(() => vi.fn())
const limit = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/audit/record", () => ({ recordUserAudit: vi.fn() }))
vi.mock("@/lib/core/auth-context", () => ({ requirePermission: vi.fn() }))
vi.mock("@/lib/core/rate-limit", () => ({ assertRateLimit: limit }))
vi.mock("@/lib/api-tokens/service", async (original) => ({
  ...(await original<typeof import("@/lib/api-tokens/service")>()),
  verifyApiToken: verify,
}))
vi.mock("@/lib/organization/entitlements", async () => {
  const shared = await import("@workspace/organization/entitlements")
  return {
    entitlementsFor: shared.entitlementsFor,
    upgradeRequired: shared.upgradeRequired,
    getOrganizationPlan: plan,
  }
})

import { API_RATE_LIMITS, apiJson, apiUserAgent, withApiToken } from "./v1"

const token = {
  tokenId: "tok_1",
  prefix: "asy_abcdefgh",
  scopes: ["tasks:read"],
  ctx: {
    userId: "user_1",
    userName: "Ada",
    userEmail: "ada@example.com",
    organizationId: "org_1",
    roles: ["member"],
  },
}

function request(headers: Record<string, string> = {}) {
  return new Request("https://copilot.test/api/v1/tasks", {
    headers: { authorization: "Bearer asy_x", ...headers },
  })
}

async function call(
  scope: "tasks:read" | "tasks:write",
  handler = vi.fn(async () => apiJson({ ok: true }))
) {
  const route = withApiToken("/api/v1/test", scope, handler)
  const response = await route(request(), { params: Promise.resolve({}) })
  return { response, body: await response.json(), handler }
}

beforeEach(() => {
  vi.clearAllMocks()
  verify.mockResolvedValue(token)
  plan.mockResolvedValue("team")
  limit.mockResolvedValue(undefined)
})

describe("withApiToken", () => {
  it("runs the handler for a valid token with the scope", async () => {
    const { response, body, handler } = await call("tasks:read")
    expect(response.status).toBe(200)
    expect(body).toEqual({ data: { ok: true } })
    expect(verify).toHaveBeenCalledWith("asy_x")
    expect(limit).toHaveBeenCalledWith(
      "api:tok_1",
      API_RATE_LIMITS.team,
      60_000,
      { failOpen: false }
    )
    expect(handler).toHaveBeenCalledOnce()
  })

  it("returns the token error code with 401", async () => {
    verify.mockRejectedValue(
      new UnauthorizedError("expired", { code: "token_expired" })
    )
    const { response, body, handler } = await call("tasks:read")
    expect(response.status).toBe(401)
    expect(body.error.code).toBe("token_expired")
    expect(handler).not.toHaveBeenCalled()
  })

  it("refuses a missing scope even for an owner", async () => {
    verify.mockResolvedValue({
      ...token,
      ctx: { ...token.ctx, roles: ["owner"] },
    })
    const { response, body, handler } = await call("tasks:write")
    expect(response.status).toBe(403)
    expect(body.error.code).toBe("token_scope_missing")
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns 429 with Retry-After when the limit is reached", async () => {
    limit.mockRejectedValue(
      new AppError("rate_limited", "Slow down", { status: 429, retryAfter: 12 })
    )
    const { response, body } = await call("tasks:read")
    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("12")
    expect(body.error.code).toBe("rate_limited")
  })

  it("keeps a domain app's 404 instead of a 500", async () => {
    const { response, body } = await call(
      "tasks:read",
      vi.fn(async () => {
        throw new DomainClientError("not_found", "Project was not found.", 404)
      })
    )
    expect(response.status).toBe(404)
    expect(body.error.code).toBe("not_found")
  })

  it("hides the message of an unexpected failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { response, body } = await call(
      "tasks:read",
      vi.fn(async () => {
        throw new Error("pg: connection refused")
      })
    )
    expect(response.status).toBe(500)
    expect(body.error.message).not.toContain("pg")
  })

  it("limits each plan differently", () => {
    expect(API_RATE_LIMITS.free).toBeLessThan(API_RATE_LIMITS.team)
    expect(API_RATE_LIMITS.team).toBeLessThan(API_RATE_LIMITS.enterprise)
  })
})

describe("apiUserAgent", () => {
  it("names the token and keeps the client", () => {
    expect(
      apiUserAgent(
        token as never,
        request({ "user-agent": "asynchrone-cli/0.1" })
      )
    ).toBe("asynchrone-api (token asy_abcdefgh) asynchrone-cli/0.1")
  })
})
