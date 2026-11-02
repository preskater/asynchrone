import type { z } from "zod"

import type { DomainAppKey, DomainOperation } from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { getCorrelationId } from "@workspace/observability/next"

import { domainClient } from "@/lib/identity"

/**
 * This app's delegated gateway to the other domain apps.
 *
 * The caller proves which app it is with client credentials; the delegated
 * context proves on whose behalf it acts. The target app re-applies its own
 * organization, role and visibility rules and writes its own audit row.
 */
export function delegatedContext(ctx: RequestContext) {
  return {
    userId: ctx.userId,
    userName: ctx.userName,
    userEmail: ctx.userEmail,
    organizationId: ctx.organizationId,
    role: ctx.role,
    impersonatedBy: null,
    portal: null,
  }
}

export async function callDomain<T>(
  app: DomainAppKey,
  operation: DomainOperation,
  context: ReturnType<typeof delegatedContext>,
  input: unknown,
  schema: z.ZodType<T>,
  options?: { idempotencyKey?: string }
): Promise<T> {
  const correlationId = await getCorrelationId()
  return domainClient(app).call(operation, context, input, schema, {
    ...options,
    correlationId,
  })
}
