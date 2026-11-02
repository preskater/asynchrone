import type { z } from "zod"

import {
  APPS,
  DomainClient,
  type DelegatedContext,
  type DomainAppKey,
  type DomainOperation,
} from "@workspace/contracts"
import { ServiceTokenClient } from "@workspace/service-auth"
import type { RequestContext } from "@workspace/core/context"
import { getCorrelationId } from "@workspace/observability/next"
import type { PortalContext } from "@workspace/portal/types"

/**
 * Copilot's delegated domain gateway.
 *
 * The assistant, MCP tools and the portal never open a domain database: they
 * call `/internal/v1/domain/:operation` with a client-credentials token and a
 * delegated context. The target app re-applies its authorization rules and
 * writes its own audit rows.
 */
let tokens: ServiceTokenClient | null = null
const clients = new Map<DomainAppKey, DomainClient | null>()

function tokenClient(): ServiceTokenClient | null {
  if (tokens) return tokens
  const issuer = process.env.COPILOT_APP_URL ?? process.env.BETTER_AUTH_URL
  const clientId = process.env.COPILOT_OAUTH_CLIENT_ID
  const clientSecret = process.env.COPILOT_OAUTH_CLIENT_SECRET
  if (!issuer || !clientId || !clientSecret) return null
  tokens = new ServiceTokenClient({ issuer, clientId, clientSecret })
  return tokens
}

/** The configured client for a domain app, or null when the origin is unset. */
export function domainClient(app: DomainAppKey): DomainClient | null {
  if (clients.has(app)) return clients.get(app) ?? null
  const baseUrl = process.env[APPS[app].hostEnv]
  const service = tokenClient()
  const client =
    baseUrl && service
      ? new DomainClient({
          app,
          baseUrl,
          getToken: (request) => service.getToken(request),
        })
      : null
  clients.set(app, client)
  return client
}

export function requireDomainClient(app: DomainAppKey): DomainClient {
  const client = domainClient(app)
  if (!client) {
    throw new Error(
      `${APPS[app].hostEnv}, COPILOT_OAUTH_CLIENT_ID and COPILOT_OAUTH_CLIENT_SECRET are required for ${app} internal calls`
    )
  }
  return client
}

/** Delegated context for an internal workspace caller. */
export function delegatedContext(
  ctx: RequestContext,
  impersonatedBy?: string | null
): DelegatedContext {
  return {
    userId: ctx.userId,
    userName: ctx.userName,
    userEmail: ctx.userEmail,
    organizationId: ctx.organizationId,
    role: ctx.role,
    impersonatedBy: impersonatedBy ?? null,
    portal: null,
  }
}

/** Delegated context for a client-portal caller. */
export function delegatedPortalContext(ctx: PortalContext): DelegatedContext {
  return {
    userId: ctx.userId,
    userName: ctx.userName,
    userEmail: ctx.userEmail,
    organizationId: ctx.organizationId,
    role: "client",
    impersonatedBy: null,
    portal: { clientId: ctx.clientId, clientName: ctx.clientName },
  }
}

export async function callDomain<T>(
  app: DomainAppKey,
  operation: DomainOperation,
  context: DelegatedContext,
  input: unknown,
  schema: z.ZodType<T>,
  options?: { idempotencyKey?: string; signal?: AbortSignal }
): Promise<T> {
  // Carry the inbound request's correlation id into the domain call so both
  // apps' logs and metrics can be joined (issue #170).
  const correlationId = await getCorrelationId()
  return requireDomainClient(app).call(operation, context, input, schema, {
    ...options,
    correlationId,
  })
}
