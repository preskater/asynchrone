import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  hasEntitlement,
  parsePlan,
  type Entitlement,
} from "@workspace/core/plans"

import {
  createOrganizationEntitlements,
  entitlementsFor,
  seatLimitReached,
  type OrgPlan,
} from "./entitlements"

const db = {
  organization: { findUnique: vi.fn() },
  member: { count: vi.fn() },
  invitation: { count: vi.fn() },
}

const service = createOrganizationEntitlements({
  db: db as never,
  planForOrganization: (organization) => parsePlan(organization.metadata),
})

const GB = 1024 ** 3

// The contract the pricing page sells; change it only together with pricing.json.
const expected: Record<OrgPlan, Record<Entitlement, number | boolean>> = {
  free: {
    seats: 5,
    storageBytes: 1 * GB,
    aiBudgetMicrosPerSeat: 0,
    auditLog: false,
    sso: false,
    scim: false,
    granularPermissions: false,
    apiAccess: true,
    requireTwoFactor: false,
    externalCollaborators: 0,
  },
  team: {
    seats: 100,
    storageBytes: 100 * GB,
    aiBudgetMicrosPerSeat: 8_000_000,
    auditLog: false,
    sso: false,
    scim: false,
    granularPermissions: true,
    apiAccess: true,
    requireTwoFactor: true,
    externalCollaborators: 5,
  },
  enterprise: {
    seats: Infinity,
    storageBytes: 1024 * GB,
    aiBudgetMicrosPerSeat: 8_000_000,
    auditLog: true,
    sso: true,
    scim: true,
    granularPermissions: true,
    apiAccess: true,
    requireTwoFactor: true,
    externalCollaborators: Infinity,
  },
}

function withPlan(metadata: string | null, trialEndsAt: Date | null = null) {
  db.organization.findUnique.mockResolvedValue({ metadata, trialEndsAt })
}

beforeEach(() => vi.clearAllMocks())

describe("entitlementsFor", () => {
  for (const plan of Object.keys(expected) as OrgPlan[]) {
    for (const [entitlement, value] of Object.entries(expected[plan])) {
      it(`${plan}.${entitlement} = ${value}`, () => {
        const entitlements = entitlementsFor(plan)
        expect(entitlements[entitlement as Entitlement]).toBe(value)
        expect(hasEntitlement(entitlements, entitlement as Entitlement)).toBe(
          Boolean(value)
        )
      })
    }
  }
})

describe("plan resolution", () => {
  it.each([
    [null, "free"],
    ["", "free"],
    ["not json", "free"],
    ['{"accent":"blue"}', "free"],
    ['{"plan":"platinum"}', "free"],
    ['{"plan":"team"}', "team"],
    ['{"plan":"enterprise","accent":"blue"}', "enterprise"],
  ])("parsePlan(%j) = %s", (metadata, plan) => {
    expect(parsePlan(metadata)).toBe(plan)
  })

  it("resolves a missing organization to free", async () => {
    db.organization.findUnique.mockResolvedValue(null)
    expect(await service.getOrganizationPlan("org_1")).toBe("free")
  })

  it("gates features on the stored plan", async () => {
    withPlan(null)
    expect(await service.can("org_1", "aiBudgetMicrosPerSeat")).toBe(false)
    await expect(
      service.requireEntitlement("org_1", "granularPermissions")
    ).rejects.toMatchObject({
      code: "upgrade_required",
      status: 403,
      params: { entitlement: "granularPermissions" },
    })

    withPlan('{"plan":"team"}')
    expect(await service.can("org_1", "aiBudgetMicrosPerSeat")).toBe(true)
    await expect(
      service.requireEntitlement("org_1", "granularPermissions")
    ).resolves.toBeUndefined()
  })

  it("enforces Team for a free organization inside its trial window", async () => {
    withPlan(null, new Date(Date.now() + 60 * 60 * 1000))
    expect(await service.getOrganizationPlan("org_1")).toBe("team")
    expect(await service.getOrganizationEntitlements("org_1")).toEqual(
      entitlementsFor("team")
    )
  })

  it("falls back to the stored plan once the trial window closes", async () => {
    withPlan(null, new Date(Date.now() - 1000))
    expect(await service.getOrganizationPlan("org_1")).toBe("free")
    expect(await service.getOrganizationEntitlements("org_1")).toEqual(
      entitlementsFor("free")
    )
  })

  it("never downgrades a paid plan during a trial", async () => {
    withPlan('{"plan":"enterprise"}', new Date(Date.now() + 1000))
    expect(await service.getOrganizationPlan("org_1")).toBe("enterprise")
  })

  it("keeps audit-log access on the auditLog entitlement", async () => {
    withPlan('{"plan":"team"}')
    expect(await service.can("org_1", "auditLog")).toBe(false)
    withPlan('{"plan":"enterprise"}')
    expect(await service.can("org_1", "auditLog")).toBe(true)
  })
})

describe("seats", () => {
  it.each([
    [5, 4, 0, false],
    [5, 5, 0, true],
    [5, 4, 1, true],
    [5, 3, 1, false],
    [Infinity, 10_000, 500, false],
  ])(
    "seats=%s members=%s pending=%s → full=%s",
    (seats, members, pending, full) => {
      expect(seatLimitReached(seats, members, pending)).toBe(full)
    }
  )

  it("blocks a 6th member on Starter, excluding portal clients", async () => {
    withPlan(null)
    db.member.count.mockResolvedValue(5)
    expect(await service.seatsFull("org_1", { countPending: false })).toEqual({
      full: true,
      seats: 5,
    })
    expect(db.member.count).toHaveBeenCalledWith({
      where: { organizationId: "org_1", clientId: null },
    })
  })

  it("counts pending workspace invitations when inviting", async () => {
    withPlan(null)
    db.member.count.mockResolvedValue(4)
    db.invitation.count.mockResolvedValue(1)
    expect(
      (await service.seatsFull("org_1", { countPending: true })).full
    ).toBe(true)
    expect(db.invitation.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: "pending",
        NOT: { role: "client" },
      }),
    })
  })
})
