import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePlatformContext: vi.fn(),
  recordPlatformEvent: vi.fn(),
  admin: {
    createHandoff: vi.fn(),
    getUser: vi.fn(),
    setBan: vi.fn(),
    revokeSessions: vi.fn(),
    getOrganization: vi.fn(),
    updatePlan: vi.fn(),
    releasePlan: vi.fn(),
    getOAuthClient: vi.fn(),
    setOAuthClientDisabled: vi.fn(),
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`)
  },
}))
vi.mock("@/lib/platform/guard", () => ({
  requirePlatformContext: mocks.requirePlatformContext,
}))
vi.mock("@/lib/platform/audit", () => ({
  recordPlatformEvent: mocks.recordPlatformEvent,
}))
vi.mock("@/lib/platform/identity", () => ({
  identityAdmin: () => mocks.admin,
}))

import { startImpersonation } from "./impersonation"
import {
  releaseOrganizationPlanOverride,
  setOAuthClientDisabled,
  updateOrganizationPlan,
} from "./organizations"
import { revokeUserSessions, setUserBanned } from "./users"

const admin = { userId: "op_1", role: "platform_admin" }
const support = { userId: "op_2", role: "platform_support" }

function signInAs(ctx: typeof admin) {
  mocks.requirePlatformContext.mockResolvedValue(ctx)
}

function auditedActions() {
  return mocks.recordPlatformEvent.mock.calls.map(([, input]) => input.action)
}

beforeEach(() => {
  vi.clearAllMocks()
  signInAs(admin)
})

const adminOnly: [string, () => Promise<unknown>][] = [
  ["setUserBanned", () => setUserBanned({ userId: "u", banned: true })],
  [
    "updateOrganizationPlan",
    () =>
      updateOrganizationPlan({
        organizationId: "o",
        plan: "team",
        quotaBytes: null,
      }),
  ],
  [
    "releaseOrganizationPlanOverride",
    () => releaseOrganizationPlanOverride({ organizationId: "o" }),
  ],
  [
    "setOAuthClientDisabled",
    () => setOAuthClientDisabled({ clientId: "c", disabled: true }),
  ],
]

describe("platform authorization", () => {
  it.each(adminOnly)("%s refuses platform_support", async (_name, run) => {
    signInAs(support)
    await expect(run()).resolves.toMatchObject({ ok: false })
    for (const call of Object.values(mocks.admin)) {
      expect(call).not.toHaveBeenCalled()
    }
    expect(mocks.recordPlatformEvent).not.toHaveBeenCalled()
  })

  it.each(adminOnly)("%s goes through the action guard", async (_name, run) => {
    mocks.requirePlatformContext.mockRejectedValue(new Error("denied"))
    await expect(run()).rejects.toThrow("denied")
    expect(mocks.requirePlatformContext).toHaveBeenCalledWith({
      surface: "action",
    })
  })

  it("lets platform_support revoke sessions, with an audit row", async () => {
    signInAs(support)
    mocks.admin.revokeSessions.mockResolvedValue({ deleted: 2 })
    await expect(revokeUserSessions({ userId: "u" })).resolves.toEqual({
      ok: true,
    })
    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      support,
      expect.objectContaining({
        action: "user.sessions.revoke",
        after: { deleted: 2 },
      })
    )
  })
})

describe("input validation", () => {
  it.each([
    ["setUserBanned", () => setUserBanned({ userId: "", banned: true })],
    ["revokeUserSessions", () => revokeUserSessions({})],
    [
      "updateOrganizationPlan",
      () =>
        updateOrganizationPlan({
          organizationId: "o",
          plan: "platinum",
          quotaBytes: null,
        }),
    ],
    [
      "releaseOrganizationPlanOverride",
      () => releaseOrganizationPlanOverride({}),
    ],
    ["setOAuthClientDisabled", () => setOAuthClientDisabled({ clientId: "c" })],
  ])("%s rejects bad input before the guard", async (_name, run) => {
    await expect(run()).resolves.toEqual({ ok: false, error: "Invalid input." })
    expect(mocks.requirePlatformContext).not.toHaveBeenCalled()
  })
})

describe("startImpersonation", () => {
  it("rejects invalid input", async () => {
    await expect(startImpersonation({ userId: "" })).rejects.toThrow(
      "Invalid impersonation request."
    )
    expect(mocks.admin.createHandoff).not.toHaveBeenCalled()
  })

  it("is reserved to platform admins", async () => {
    signInAs(support)
    await expect(startImpersonation({ userId: "u" })).rejects.toThrow(
      "Only platform admins"
    )
    expect(mocks.admin.createHandoff).not.toHaveBeenCalled()
  })

  it("audits the handoff, then redirects to it", async () => {
    mocks.admin.createHandoff.mockResolvedValue({ url: "https://copilot/h" })
    await expect(
      startImpersonation({ userId: "u", organizationId: "o" })
    ).rejects.toThrow("REDIRECT:https://copilot/h")
    expect(mocks.admin.createHandoff).toHaveBeenCalledWith({
      userId: "u",
      organizationId: "o",
      actorId: "op_1",
    })
    expect(auditedActions()).toEqual(["platform.impersonate.start"])
  })
})

describe("setUserBanned", () => {
  it("does not mutate an unknown user", async () => {
    mocks.admin.getUser.mockResolvedValue(null)
    await expect(
      setUserBanned({ userId: "u", banned: true })
    ).resolves.toMatchObject({ ok: false })
    expect(mocks.admin.setBan).not.toHaveBeenCalled()
  })

  it.each([
    [true, "user.ban"],
    [false, "user.unban"],
  ])("audits banned=%s as %s", async (banned, action) => {
    mocks.admin.getUser.mockResolvedValue({ banned: !banned, banReason: null })
    mocks.admin.setBan.mockResolvedValue({ banned, banReason: null })
    await expect(setUserBanned({ userId: "u", banned })).resolves.toEqual({
      ok: true,
    })
    expect(auditedActions()).toEqual([action])
  })
})

describe("organization plans", () => {
  const organization = {
    plan: "free",
    subscriptionStatus: null,
    manualOverride: false,
    storageQuotaBytes: null,
  }

  it("does not mutate an unknown organization", async () => {
    mocks.admin.getOrganization.mockResolvedValue(null)
    await updateOrganizationPlan({
      organizationId: "o",
      plan: "team",
      quotaBytes: null,
    })
    await releaseOrganizationPlanOverride({ organizationId: "o" })
    expect(mocks.admin.updatePlan).not.toHaveBeenCalled()
    expect(mocks.admin.releasePlan).not.toHaveBeenCalled()
  })

  it("audits a plan change with its before and after state", async () => {
    mocks.admin.getOrganization.mockResolvedValue(organization)
    mocks.admin.updatePlan.mockResolvedValue({
      ...organization,
      plan: "team",
      manualOverride: true,
    })
    await expect(
      updateOrganizationPlan({
        organizationId: "o",
        plan: "team",
        quotaBytes: 1024,
      })
    ).resolves.toEqual({ ok: true })
    expect(mocks.admin.updatePlan).toHaveBeenCalledWith("o", {
      plan: "team",
      quotaBytes: 1024,
    })
    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        action: "organization.plan.update",
        before: expect.objectContaining({ plan: "free", status: "inactive" }),
        after: expect.objectContaining({ plan: "team", manualOverride: true }),
      })
    )
  })

  it("only releases a manual override", async () => {
    mocks.admin.getOrganization.mockResolvedValue(organization)
    await expect(
      releaseOrganizationPlanOverride({ organizationId: "o" })
    ).resolves.toMatchObject({ ok: false })
    expect(mocks.admin.releasePlan).not.toHaveBeenCalled()

    mocks.admin.getOrganization.mockResolvedValue({
      ...organization,
      manualOverride: true,
    })
    mocks.admin.releasePlan.mockResolvedValue(organization)
    await expect(
      releaseOrganizationPlanOverride({ organizationId: "o" })
    ).resolves.toEqual({ ok: true })
    expect(auditedActions()).toEqual(["organization.plan.release"])
  })
})

describe("setOAuthClientDisabled", () => {
  it("does not mutate an unknown client", async () => {
    mocks.admin.getOAuthClient.mockResolvedValue(null)
    await expect(
      setOAuthClientDisabled({ clientId: "c", disabled: true })
    ).resolves.toMatchObject({ ok: false })
    expect(mocks.admin.setOAuthClientDisabled).not.toHaveBeenCalled()
  })

  it.each([
    [true, "oauth-client.disable"],
    [false, "oauth-client.enable"],
  ])("audits disabled=%s as %s", async (disabled, action) => {
    mocks.admin.getOAuthClient.mockResolvedValue({
      disabled: !disabled,
      name: "n",
    })
    mocks.admin.setOAuthClientDisabled.mockResolvedValue({
      disabled,
      name: "n",
    })
    await expect(
      setOAuthClientDisabled({ clientId: "c", disabled })
    ).resolves.toEqual({ ok: true })
    expect(auditedActions()).toEqual([action])
  })
})
