import { describe, expect, it } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import { resolveEmployeeAccess } from "./access"

function context(role: RequestContext["roles"][number]): RequestContext {
  return {
    userId: "user_1",
    userName: "Ada",
    userEmail: "ada@example.com",
    organizationId: "org_1",
    roles: [role],
  }
}

describe("resolveEmployeeAccess", () => {
  it("gives admins the full team view", () => {
    expect(resolveEmployeeAccess(context("admin"))).toMatchObject({
      isAdmin: true,
      isValidator: true,
      canViewAll: true,
      canTrack: true,
    })
  })

  it("lets designated validators approve leave and see the team", () => {
    expect(resolveEmployeeAccess(context("member"), true)).toMatchObject({
      isAdmin: false,
      isValidator: true,
      canViewAll: true,
      canTrack: true,
    })
  })

  it("keeps ordinary members to their own attendance", () => {
    expect(resolveEmployeeAccess(context("member"))).toMatchObject({
      isAdmin: false,
      isValidator: false,
      canViewAll: false,
      canTrack: true,
    })
  })

  it("keeps viewers from tracking time", () => {
    expect(resolveEmployeeAccess(context("viewer"))).toMatchObject({
      isAdmin: false,
      canTrack: false,
      canViewAll: false,
    })
  })
})
