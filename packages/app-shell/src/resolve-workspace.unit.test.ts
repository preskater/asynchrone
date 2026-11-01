import { describe, expect, it, vi } from "vitest"

import type { WorkspaceSession } from "./resolve-workspace"
import { resolveWorkspace } from "./resolve-workspace"

function session(overrides: Partial<WorkspaceSession["session"]> = {}) {
  return {
    user: { id: "user_1", name: "Ada", email: "ada@example.com" },
    session: {
      id: "session_1",
      activeOrganizationId: "org_1",
      createdAt: new Date(),
      ...overrides,
    },
  }
}

const organizations = [
  { id: "org_1", slug: "acme", name: "Acme" },
  { id: "org_2", slug: "other", name: "Other" },
]

describe("resolveWorkspace", () => {
  it("redirects signed-out visitors", async () => {
    const result = await resolveWorkspace({
      getSession: async () => null,
      listOrganizations: async () => [],
      isPortalMember: async () => false,
    })
    expect(result).toEqual({
      kind: "redirect",
      to: "/sign-in",
      reason: "signed-out",
    })
  })

  it("expires an impersonation that outlived its TTL", async () => {
    const end = vi.fn()
    const result = await resolveWorkspace({
      getSession: async () =>
        session({
          impersonatedBy: "platform_admin",
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        }),
      listOrganizations: async () => organizations,
      isPortalMember: async () => false,
      endExpiredImpersonation: end,
    })
    expect(end).toHaveBeenCalledWith("session_1")
    expect(result).toMatchObject({
      kind: "redirect",
      reason: "impersonation-expired",
    })
  })

  it("redirects portal members and resolves an internal organization", async () => {
    const base = {
      getSession: async () => session(),
      listOrganizations: async () => organizations,
    }
    expect(
      await resolveWorkspace({
        ...base,
        isPortalMember: async () => true,
      })
    ).toMatchObject({ kind: "redirect", to: "/portal", reason: "portal" })

    const result = await resolveWorkspace({
      ...base,
      orgSlug: "other",
      isPortalMember: async () => false,
    })
    expect(result).toMatchObject({
      kind: "ok",
      organization: { id: "org_2" },
      needsSync: true,
    })
  })
})
