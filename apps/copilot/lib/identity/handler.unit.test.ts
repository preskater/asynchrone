import { ServiceAuthError } from "@workspace/service-auth"
import { describe, expect, it, vi } from "vitest"

import { handleIdentityRequest } from "./handler"
import type { IdentityRepository } from "./repository"

const organization = { id: "org_1", name: "Acme", slug: "acme" }
const members = [
  {
    id: "user_1",
    name: "Ada",
    email: "ada@example.com",
    role: "owner" as const,
    clientId: null,
  },
]
const entitlements = {
  plan: "team" as const,
  seats: 100,
  storageBytes: 1_000,
  aiBudgetMicrosPerSeat: 8_000_000,
  auditLog: false,
  sso: false,
  requireTwoFactor: true,
  granularPermissions: true,
  apiAccess: true,
  scim: false,
}

const repository: IdentityRepository = {
  getOrganization: vi.fn(async () => organization),
  listMembers: vi.fn(async () => members),
  getUser: vi.fn(async () => ({
    id: "user_1",
    name: "Ada",
    email: "ada@example.com",
  })),
  getEntitlements: vi.fn(async () => entitlements),
}

async function call(
  segments: string[],
  options: { authorize?: () => Promise<void> } = {}
) {
  return handleIdentityRequest({
    segments,
    request: new Request("https://copilot.asynchrone.space/internal/v1/x"),
    authorize: options.authorize ?? (async () => undefined),
    repository,
  })
}

describe("identity internal handler", () => {
  it("returns an organization, members and entitlements", async () => {
    const org = await call(["organizations", "org_1"])
    expect(org.status).toBe(200)
    expect(org.headers.get("cache-control")).toContain("max-age=30")
    expect((await org.json()).data).toEqual(organization)

    const list = await call(["organizations", "org_1", "members"])
    expect((await list.json()).data).toEqual(members)

    const plan = await call(["organizations", "org_1", "entitlements"])
    expect((await plan.json()).data).toMatchObject({
      plan: "team",
      requireTwoFactor: true,
    })
  })

  it("returns a user", async () => {
    const response = await call(["users", "user_1"])
    expect((await response.json()).data).toMatchObject({ id: "user_1" })
  })

  it("returns 404 for an unknown resource or entity", async () => {
    expect((await call(["nope"])).status).toBe(404)
    repository.getOrganization = vi.fn(async () => null)
    expect((await call(["organizations", "missing"])).status).toBe(404)
  })

  it("maps a service-token failure to 401/403", async () => {
    const unauthorized = await call(["organizations", "org_1"], {
      authorize: async () => {
        throw new ServiceAuthError("missing_token", "Token required", 401)
      },
    })
    expect(unauthorized.status).toBe(401)
    expect((await unauthorized.json()).error.code).toBe("missing_token")

    const forbidden = await call(["organizations", "org_1"], {
      authorize: async () => {
        throw new ServiceAuthError("insufficient_scope", "No scope", 403)
      },
    })
    expect(forbidden.status).toBe(403)
  })
})
