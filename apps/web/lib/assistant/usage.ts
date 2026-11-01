import type { Usage } from "@openai/agents"
import {
  getAiQuota as getAiQuotaFromStore,
  quotaExceeded,
  recordAiUsage as recordAiUsageInStore,
  tokenUsage,
  type AiUsageStore,
} from "@workspace/ai/usage"
import type { RequestContext } from "@workspace/core/context"

import { getOrganizationEntitlements } from "@/lib/organization/entitlements"
import { prisma } from "@/lib/prisma"

/**
 * Copilot's adapter for the AI ledger.
 *
 * `@workspace/ai` computes quota and cost; this file binds it to Copilot's
 * identity database. No other app reads `AiUsageEvent`.
 */
const store: AiUsageStore = {
  countSeats(organizationId) {
    // Client-portal accounts never take a seat, so they add no budget either.
    return prisma.member.count({ where: { organizationId, clientId: null } })
  },
  async sumCostMicros(organizationId, since) {
    const spent = await prisma.aiUsageEvent.aggregate({
      where: { organizationId, createdAt: { gte: since } },
      _sum: { costMicros: true },
    })
    return spent._sum.costMicros ?? 0
  },
  createUsageEvent(input) {
    return prisma.aiUsageEvent.create({ data: input })
  },
}

export function getAiQuota(organizationId: string, now = new Date()) {
  return getAiQuotaFromStore(
    store,
    getOrganizationEntitlements,
    organizationId,
    now
  )
}

export function recordAiUsage(
  ctx: RequestContext,
  model: string,
  usage: Usage
) {
  return recordAiUsageInStore(store, ctx, model, usage)
}

export { quotaExceeded, tokenUsage }
