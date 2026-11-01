import type { Usage } from "@openai/agents"
import { monthWindow } from "@workspace/db/plans"

import { AppError } from "@workspace/core/errors"
import type { RequestContext } from "@workspace/core/context"

import { costMicros, type TokenUsage } from "./pricing"

/**
 * Copilot's AI ledger.
 *
 * The package computes quota and cost; the app supplies the storage port so
 * the assistant never reaches for a database client of its own. The identity
 * database owns `AiUsageEvent` and the seat count.
 */
export interface AiUsageStore {
  /** Seats that draw an AI budget; client-portal accounts never take one. */
  countSeats(organizationId: string): Promise<number>
  sumCostMicros(organizationId: string, since: Date): Promise<number>
  createUsageEvent(input: {
    organizationId: string
    userId: string
    model: string
    requests: number
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    costMicros: number
  }): PromiseLike<unknown>
}

/** Only the per-seat budget is needed; the full entitlement set is compatible. */
export type AiBudgetLookup = (
  organizationId: string
) => Promise<{ aiBudgetMicrosPerSeat: number }>

export async function getAiQuota(
  store: AiUsageStore,
  budgetFor: AiBudgetLookup,
  organizationId: string,
  now = new Date()
) {
  const { start, resetAt } = monthWindow(now)
  const [{ aiBudgetMicrosPerSeat }, seats, spent] = await Promise.all([
    budgetFor(organizationId),
    store.countSeats(organizationId),
    store.sumCostMicros(organizationId, start),
  ])
  return {
    budgetMicros: aiBudgetMicrosPerSeat * seats,
    usedMicros: spent,
    resetAt,
  }
}

export function quotaExceeded(resetAt: Date) {
  return new AppError(
    "quota_exceeded",
    "Your workspace has used its AI allowance for this month.",
    { status: 429, params: { resetAt: resetAt.toISOString() } }
  )
}

/**
 * Provider token details are `{ [key: string]: number | TokenDetails }`, so a
 * count is only read when the value is actually a number.
 */
function detailCount(details: object, key: string): number {
  const value = (details as Record<string, unknown>)[key]
  return typeof value === "number" ? value : 0
}

/** Sums the run's per-request token details into the fields we store. */
export function tokenUsage(usage: Usage): TokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedTokens: usage.inputTokensDetails.reduce(
      (sum, details) => sum + detailCount(details, "cached_tokens"),
      0
    ),
  }
}

export async function recordAiUsage(
  store: AiUsageStore,
  ctx: RequestContext,
  model: string,
  usage: Usage
) {
  const tokens = tokenUsage(usage)
  if (usage.requests === 0 && tokens.inputTokens === 0) return
  await store.createUsageEvent({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    model,
    requests: usage.requests,
    ...tokens,
    costMicros: costMicros(model, tokens),
  })
}
