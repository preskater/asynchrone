import { Usage } from "@openai/agents"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { monthWindow } from "@workspace/core/plans"

import type { RequestContext } from "@workspace/core/context"

import type { AiBudgetLookup, AiUsageStore } from "./usage"
import { getAiQuota, quotaExceeded, recordAiUsage, tokenUsage } from "./usage"

const ctx: RequestContext = {
  userId: "user_1",
  userName: "Ada",
  userEmail: "ada@example.com",
  organizationId: "org_1",
  roles: ["owner"],
}

const store: AiUsageStore = {
  countSeats: vi.fn(),
  sumCostMicros: vi.fn(),
  createUsageEvent: vi.fn(),
}

const budgetFor: AiBudgetLookup = vi.fn()

beforeEach(() => vi.clearAllMocks())

describe("monthWindow", () => {
  it("spans the current UTC month", () => {
    const { start, resetAt } = monthWindow(new Date("2026-12-31T23:59:59Z"))
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z")
    expect(resetAt.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })
})

describe("getAiQuota", () => {
  it("gives Free no budget", async () => {
    vi.mocked(budgetFor).mockResolvedValue({ aiBudgetMicrosPerSeat: 0 })
    vi.mocked(store.countSeats).mockResolvedValue(3)
    vi.mocked(store.sumCostMicros).mockResolvedValue(0)
    expect(await getAiQuota(store, budgetFor, "org_1")).toMatchObject({
      budgetMicros: 0,
      usedMicros: 0,
    })
  })

  it("scales the budget with workspace seats and sums this month's spend", async () => {
    vi.mocked(budgetFor).mockResolvedValue({ aiBudgetMicrosPerSeat: 8_000_000 })
    vi.mocked(store.countSeats).mockResolvedValue(4)
    vi.mocked(store.sumCostMicros).mockResolvedValue(5_000)
    const now = new Date("2026-10-29T12:00:00Z")
    expect(await getAiQuota(store, budgetFor, "org_1", now)).toEqual({
      budgetMicros: 4 * 8_000_000,
      usedMicros: 5_000,
      resetAt: new Date("2026-11-01T00:00:00Z"),
    })
    expect(budgetFor).toHaveBeenCalledWith("org_1")
    expect(store.countSeats).toHaveBeenCalledWith("org_1")
    expect(store.sumCostMicros).toHaveBeenCalledWith(
      "org_1",
      new Date("2026-10-01T00:00:00Z")
    )
  })
})

describe("quotaExceeded", () => {
  it("is a 429 carrying the reset date", () => {
    const error = quotaExceeded(new Date("2026-11-01T00:00:00Z"))
    expect(error).toMatchObject({
      code: "quota_exceeded",
      status: 429,
      params: { resetAt: "2026-11-01T00:00:00.000Z" },
    })
  })
})

describe("recording", () => {
  const usage = new Usage({
    requests: 2,
    inputTokens: 3_000,
    outputTokens: 500,
    totalTokens: 3_500,
    inputTokensDetails: [
      { cached_tokens: 1_000 },
      { cached_tokens: 200 },
    ] as never,
  })

  it("sums cached tokens across requests", () => {
    expect(tokenUsage(usage)).toEqual({
      inputTokens: 3_000,
      outputTokens: 500,
      cachedTokens: 1_200,
    })
  })

  it("writes one event with its cost", async () => {
    await recordAiUsage(store, ctx, "gpt-4o-mini", usage)
    expect(store.createUsageEvent).toHaveBeenCalledTimes(1)
    expect(store.createUsageEvent).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_1",
      model: "gpt-4o-mini",
      requests: 2,
      inputTokens: 3_000,
      outputTokens: 500,
      cachedTokens: 1_200,
      // 1800 × 0.15 + 1200 × 0.075 + 500 × 0.6 = 270 + 90 + 300
      costMicros: 660,
    })
  })

  it("skips runs aborted before any model call", async () => {
    await recordAiUsage(store, ctx, "gpt-4o-mini", new Usage())
    expect(store.createUsageEvent).not.toHaveBeenCalled()
  })
})
