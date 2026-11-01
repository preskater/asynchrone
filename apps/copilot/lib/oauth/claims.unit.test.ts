import { describe, expect, it } from "vitest"

import { buildOAuthClaims, twoFactorEnrollmentRequired } from "./claims"

const user = {
  id: "user_1",
  name: "Ada",
  email: "ada@example.com",
  twoFactorEnabled: false,
}

const organization = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  requireTwoFactor: true,
}

describe("OAuth claims", () => {
  it("includes organization, role and plan claims", () => {
    const claims = buildOAuthClaims({
      user,
      organization,
      member: { role: "owner" },
      plan: "team",
      requireTwoFactorEntitled: true,
    })

    expect(claims).toMatchObject({
      organizationId: "org_1",
      org: "org_1",
      org_slug: "acme",
      organizationName: "Acme",
      role: "owner",
      plan: "team",
      userName: "Ada",
      userEmail: "ada@example.com",
    })
  })

  it("uses the first role when a member has several", () => {
    const claims = buildOAuthClaims({
      user,
      organization,
      member: { role: "admin,member" },
      plan: "free",
      requireTwoFactorEntitled: false,
    })
    expect(claims.role).toBe("admin")
  })

  it("falls back to member when the membership is missing", () => {
    const claims = buildOAuthClaims({
      user,
      organization,
      member: null,
      plan: "free",
      requireTwoFactorEntitled: false,
    })
    expect(claims.role).toBe("member")
  })

  it("reports whether the organization policy applies and is met", () => {
    const claims = buildOAuthClaims({
      user,
      organization,
      member: { role: "member" },
      plan: "team",
      requireTwoFactorEntitled: true,
    })
    expect(claims.twoFactorRequired).toBe(true)
    expect(claims.twoFactorEnrolled).toBe(false)

    expect(
      twoFactorEnrollmentRequired({
        required: true,
        entitled: true,
        enrolled: false,
        impersonated: false,
      })
    ).toBe(true)
    expect(
      twoFactorEnrollmentRequired({
        required: true,
        entitled: true,
        enrolled: false,
        impersonated: true,
      })
    ).toBe(false)
  })

  it("does not require enrollment when the plan lacks the entitlement", () => {
    const claims = buildOAuthClaims({
      user,
      organization,
      member: { role: "owner" },
      plan: "free",
      requireTwoFactorEntitled: false,
    })
    expect(claims.twoFactorRequired).toBe(false)
  })
})
