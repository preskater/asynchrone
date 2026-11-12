import { describe, expect, it } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import { resolveClientAccess } from "./access"

function context(role: RequestContext["roles"][number]): RequestContext {
  return {
    userId: "user_1",
    userName: "Ada",
    userEmail: "ada@example.com",
    organizationId: "org_1",
    roles: [role],
  }
}

describe("resolveClientAccess", () => {
  it("lets owners and admins manage pipelines and custom fields", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(resolveClientAccess(context(role))).toMatchObject({
        canEdit: true,
        canManage: true,
        canExport: true,
      })
    }
  })

  it("lets members edit and export but not manage configuration", () => {
    expect(resolveClientAccess(context("member"))).toMatchObject({
      canEdit: true,
      canManage: false,
      canExport: true,
    })
  })

  it("keeps viewers read-only", () => {
    expect(resolveClientAccess(context("viewer"))).toMatchObject({
      canEdit: false,
      canManage: false,
      canExport: false,
    })
  })

  it("keeps portal clients read-only", () => {
    expect(resolveClientAccess(context("client"))).toMatchObject({
      canEdit: false,
      canManage: false,
      canExport: false,
    })
  })
})
