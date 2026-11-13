import { describe, expect, it, vi } from "vitest"

import {
  isSsoSessionPath,
  requiresSso,
  ssoDomainCandidates,
  type SsoPolicyDb,
} from "./sso"

const organization = { metadata: null, trialEndsAt: null, subscription: null }

function db(options: {
  email?: string | null
  provider?: boolean
  role?: string | null
}): SsoPolicyDb {
  return {
    user: {
      findUnique: vi.fn(async () =>
        options.email === null
          ? null
          : { email: options.email ?? "ada@corp.com" }
      ),
    },
    ssoProvider: {
      findFirst: vi.fn(async () =>
        options.provider === false
          ? null
          : { organizationId: "org_1", organization }
      ),
    },
    member: {
      findFirst: vi.fn(async () =>
        options.role === null ? null : { role: options.role ?? "member" }
      ),
    },
  }
}

function org(sso = true) {
  return {
    resolvePlan: vi.fn(() => "enterprise"),
    entitlementsFor: vi.fn(() => ({ sso })),
    parseRoles: (role: string | null | undefined) =>
      (role ?? "").split(",").filter(Boolean),
  }
}

describe("ssoDomainCandidates", () => {
  it("lists the domain and its parents, never the bare TLD", () => {
    expect(ssoDomainCandidates("a@EU.Corp.com")).toEqual([
      "eu.corp.com",
      "corp.com",
    ])
    expect(ssoDomainCandidates("broken")).toEqual([])
  })
})

describe("isSsoSessionPath", () => {
  it("recognizes the SSO callbacks only", () => {
    expect(isSsoSessionPath("/sso/callback/acme")).toBe(true)
    expect(isSsoSessionPath("/sso/saml2/callback/acme")).toBe(true)
    expect(isSsoSessionPath("/sign-in/email")).toBe(false)
    expect(isSsoSessionPath(undefined)).toBe(false)
  })
})

describe("requiresSso", () => {
  it("requires SSO for a member on an enforced, verified domain", async () => {
    const policyDb = db({})
    await expect(requiresSso(policyDb, org(), "u1")).resolves.toBe(true)
    expect(policyDb.ssoProvider.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          domain: { in: ["corp.com"] },
          domainVerified: true,
          organization: { ssoEnforced: true },
        },
      })
    )
  })

  it("requires SSO for a non-member on the domain too", async () => {
    await expect(requiresSso(db({ role: null }), org(), "u1")).resolves.toBe(
      true
    )
  })

  it("keeps password sign-in for owners as break-glass", async () => {
    await expect(
      requiresSso(db({ role: "admin,owner" }), org(), "u1")
    ).resolves.toBe(false)
  })

  it("stops enforcing once the organization loses the entitlement", async () => {
    await expect(requiresSso(db({}), org(false), "u1")).resolves.toBe(false)
  })

  it("does nothing without a matching provider or user", async () => {
    await expect(
      requiresSso(db({ provider: false }), org(), "u1")
    ).resolves.toBe(false)
    await expect(requiresSso(db({ email: null }), org(), "u1")).resolves.toBe(
      false
    )
  })
})
