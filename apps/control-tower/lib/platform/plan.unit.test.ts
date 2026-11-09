import { entitlementsFor } from "@workspace/core/plans"
import { describe, expect, it } from "vitest"

import { aiBudgetMicros, quotaBytes, trialSummary, usagePercent } from "./plan"

describe("quotaBytes", () => {
  it("prefers the organization override over the plan", () => {
    expect(quotaBytes("free", "1024")).toBe(1024)
    expect(quotaBytes("team", null)).toBe(entitlementsFor("team").storageBytes)
  })
})

describe("usagePercent", () => {
  it("rounds and caps at 100", () => {
    expect(usagePercent(1, 3)).toBe(33)
    expect(usagePercent(5, 2)).toBe(100)
  })

  it("is 0 without a quota", () => {
    expect(usagePercent(5, 0)).toBe(0)
  })
})

describe("trialSummary", () => {
  const now = new Date("2026-01-10T12:00:00Z")

  it("rounds the days left up", () => {
    expect(trialSummary("2026-01-11T13:00:00Z", now)?.daysLeft).toBe(2)
  })

  it.each([null, "not-a-date", "2026-01-10T12:00:00Z", "2026-01-01T00:00:00Z"])(
    "is null for %s",
    (endsAt) => {
      expect(trialSummary(endsAt, now)).toBeNull()
    }
  )
})

describe("aiBudgetMicros", () => {
  it("scales with seats", () => {
    expect(aiBudgetMicros("team", 3)).toBe(
      entitlementsFor("team").aiBudgetMicrosPerSeat * 3
    )
  })
})
