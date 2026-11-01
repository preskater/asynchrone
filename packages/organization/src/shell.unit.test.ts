import { entitlementsFor, parsePlan } from "@workspace/db/plans"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createOrganizationShell } from "./shell"

const db = {
  organization: { findUnique: vi.fn() },
}
const { getOrganizationShell } = createOrganizationShell({
  db: db as never,
  planForOrganization: (organization) =>
    organization.subscription
      ? parsePlan(JSON.stringify({ plan: organization.subscription.plan }))
      : parsePlan(organization.metadata),
})

const DELETION_DATE = new Date("2026-12-01T00:00:00.000Z")

function organization(overrides: Record<string, unknown> = {}) {
  return {
    metadata: null,
    trialEndsAt: null,
    storageQuotaBytes: null,
    deletionScheduledAt: null,
    requireTwoFactor: false,
    subscription: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getOrganizationShell", () => {
  it("returns null when the organization is gone", async () => {
    db.organization.findUnique.mockResolvedValue(null)

    expect(await getOrganizationShell("org_gone")).toBeNull()
  })

  it("reads the row once and resolves plan, quota and deletion date", async () => {
    db.organization.findUnique.mockResolvedValue(
      organization({
        subscription: { plan: "team" },
        deletionScheduledAt: DELETION_DATE,
      })
    )

    const shell = await getOrganizationShell("org_1")

    expect(db.organization.findUnique).toHaveBeenCalledTimes(1)
    expect(shell?.entitlements).toEqual(entitlementsFor("team"))
    expect(shell?.storageQuotaBytes).toBe(entitlementsFor("team").storageBytes)
    expect(shell?.deletionScheduledAt).toEqual(DELETION_DATE)
    expect(shell?.requireTwoFactor).toBe(false)
  })

  it("lets the per-organization quota override win", async () => {
    db.organization.findUnique.mockResolvedValue(
      organization({ storageQuotaBytes: BigInt(5000) })
    )

    const shell = await getOrganizationShell("org_1")

    expect(shell?.storageQuotaBytes).toBe(5000)
  })

  it("keeps the Team entitlements of an open trial", async () => {
    db.organization.findUnique.mockResolvedValue(
      organization({
        trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      })
    )

    const shell = await getOrganizationShell("org_1")

    expect(shell?.entitlements).toEqual(entitlementsFor("team"))
    expect(shell?.storageQuotaBytes).toBe(entitlementsFor("team").storageBytes)
  })
})
