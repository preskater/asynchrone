import { describe, expect, it } from "vitest"

import {
  effectivePlan,
  trialClaimKeys,
  trialDaysLeft,
  trialEndsAtFrom,
  trialRefusal,
  trialStage,
  type TrialFields,
} from "@workspace/core/trial"

const DAY = 24 * 60 * 60 * 1000
const now = new Date("2026-11-01T12:00:00Z")

function trial(overrides: Partial<TrialFields> = {}): TrialFields {
  return {
    trialStartedAt: new Date(now.getTime() - 5 * DAY),
    trialEndsAt: new Date(now.getTime() + 9 * DAY),
    trialReminderSentAt: null,
    trialEndedAt: null,
    ...overrides,
  }
}

describe("trial window", () => {
  it("lasts 14 days and grants Team immediately", () => {
    const endsAt = trialEndsAtFrom(now)
    expect(endsAt.getTime() - now.getTime()).toBe(14 * DAY)
    expect(effectivePlan("free", { trialEndsAt: endsAt }, now)).toBe("team")
    expect(effectivePlan("free", { trialEndsAt: endsAt }, now)).toBe("team")
    expect(trialDaysLeft({ trialEndsAt: endsAt }, now)).toBe(14)
  })

  it("drops back to the stored plan at trialEndsAt", () => {
    const org = { trialEndsAt: now }
    expect(effectivePlan("free", org, now)).toBe("free")
    expect(trialDaysLeft(org, now)).toBe(0)
  })

  it("never downgrades a paid plan", () => {
    const org = { trialEndsAt: new Date(now.getTime() - DAY) }
    expect(effectivePlan("enterprise", org, now)).toBe("enterprise")
    expect(effectivePlan("team", org, now)).toBe("team")
  })
})

describe("trialStage", () => {
  it("does nothing before D-3", () => {
    expect(trialStage(trial(), now)).toBeNull()
  })

  it("reminds once at D-3", () => {
    const org = trial({ trialEndsAt: new Date(now.getTime() + 3 * DAY) })
    expect(trialStage(org, now)).toBe("remind")
    expect(trialStage({ ...org, trialReminderSentAt: now }, now)).toBeNull()
  })

  it("expires exactly at trialEndsAt", () => {
    expect(trialStage(trial({ trialEndsAt: now }), now)).toBe("expire")
  })

  it("expires once: a second run is a no-op", () => {
    const org = trial({ trialEndsAt: new Date(now.getTime() - DAY) })
    expect(trialStage(org, now)).toBe("expire")
    expect(trialStage({ ...org, trialEndedAt: now }, now)).toBeNull()
  })

  it("skips the stale reminder when the cron runs after the end", () => {
    const org = trial({ trialEndsAt: new Date(now.getTime() - 2 * DAY) })
    expect(trialStage(org, now)).toBe("expire")
  })

  it("ignores organizations that never started a trial", () => {
    expect(
      trialStage(trial({ trialStartedAt: null, trialEndsAt: null }), now)
    ).toBeNull()
  })
})

describe("abuse checks", () => {
  const fresh = { trialStartedAt: null }
  const ok = {
    plan: "free" as const,
    org: fresh,
    emailVerified: true,
    claimed: false,
  }

  it("allows a first trial for a verified free organization", () => {
    expect(trialRefusal(ok)).toBeNull()
  })

  it("allows one trial per organization", () => {
    expect(trialRefusal({ ...ok, org: { trialStartedAt: now } })).toBe(
      "trial_already_used"
    )
  })

  it("requires a verified email", () => {
    expect(trialRefusal({ ...ok, emailVerified: false })).toBe(
      "trial_email_unverified"
    )
  })

  it("refuses a re-trial on a claimed email or domain", () => {
    expect(trialRefusal({ ...ok, claimed: true })).toBe("trial_already_claimed")
  })

  it("refuses organizations already on a paid plan", () => {
    expect(trialRefusal({ ...ok, plan: "team" })).toBe("trial_not_eligible")
  })

  it("normalizes the email and blocks company domains only", () => {
    expect(trialClaimKeys("  Jane@Acme.IO ")).toEqual({
      email: "jane@acme.io",
      domain: "acme.io",
    })
    expect(trialClaimKeys("jane@gmail.com")).toEqual({
      email: "jane@gmail.com",
      domain: null,
    })
  })
})
