import { describe, expect, it } from "vitest"

import {
  resolveTokenOrganization,
  twoFactorEnrollmentRequired,
  type OrganizationChoice,
} from "./routing"

const organizations: OrganizationChoice[] = [
  { id: "org_a", name: "Acme", slug: "acme" },
  { id: "org_b", name: "Beta", slug: "beta" },
]

describe("resolveTokenOrganization", () => {
  it("accepts the organization the token was issued for", () => {
    expect(
      resolveTokenOrganization({
        tokenOrganizationId: "org_a",
        routeOrganizationId: "org_a",
        organizations,
        signInPath: "/en/sign-in",
        locale: "en",
      })
    ).toEqual({ kind: "ok" })
  })

  it("sends a visit to another membership back to the token's organization", () => {
    expect(
      resolveTokenOrganization({
        tokenOrganizationId: "org_a",
        routeOrganizationId: "org_b",
        organizations,
        signInPath: "/en/sign-in",
        locale: "en",
      })
    ).toEqual({ kind: "redirect", to: "/en/acme" })
  })

  it("keeps the route locale in the redirect", () => {
    expect(
      resolveTokenOrganization({
        tokenOrganizationId: "org_a",
        routeOrganizationId: "org_b",
        organizations,
        signInPath: "/fr/sign-in",
        locale: "fr",
      })
    ).toEqual({ kind: "redirect", to: "/fr/acme" })
  })

  it("signs out when the token's organization is no longer a membership", () => {
    expect(
      resolveTokenOrganization({
        tokenOrganizationId: "org_gone",
        routeOrganizationId: "org_b",
        organizations,
        signInPath: "/en/sign-in",
        locale: "en",
      })
    ).toEqual({ kind: "sign-out", signInPath: "/en/sign-in" })
  })
})

describe("twoFactorEnrollmentRequired", () => {
  const enrolled = {
    required: true,
    entitled: true,
    enrolled: true,
    impersonated: false,
  }

  it("blocks an unenrolled member when the plan includes the policy", () => {
    expect(twoFactorEnrollmentRequired({ ...enrolled, enrolled: false })).toBe(
      true
    )
  })

  it("lets an enrolled member through", () => {
    expect(twoFactorEnrollmentRequired(enrolled)).toBe(false)
  })

  it("lifts the policy when the plan does not include it", () => {
    expect(
      twoFactorEnrollmentRequired({
        ...enrolled,
        entitled: false,
        enrolled: false,
      })
    ).toBe(false)
  })

  it("never blocks impersonating staff, who cannot enroll for the user", () => {
    expect(
      twoFactorEnrollmentRequired({
        ...enrolled,
        enrolled: false,
        impersonated: true,
      })
    ).toBe(false)
  })

  it("ignores a policy that is not set", () => {
    expect(
      twoFactorEnrollmentRequired({
        ...enrolled,
        required: false,
        enrolled: false,
      })
    ).toBe(false)
  })
})
