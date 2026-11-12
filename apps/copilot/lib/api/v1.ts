import { NextResponse } from "next/server"

import { DomainClientError } from "@workspace/contracts"
import { AppError, toAppError, type ErrorCode } from "@workspace/core/errors"
import { jsonError } from "@workspace/core/http"
import { withObservedRoute } from "@workspace/observability/next"
import {
  requireScope,
  verifyApiToken,
  type VerifiedApiToken,
} from "@/lib/api-tokens/service"
import type { ApiTokenScope } from "@/lib/api-tokens/scopes"
import { bearerToken } from "@/lib/api-tokens/token"
import { assertRateLimit } from "@/lib/core/rate-limit"
import {
  entitlementsFor,
  getOrganizationPlan,
  upgradeRequired,
  type OrgPlan,
} from "@/lib/organization/entitlements"

/** Requests per token per minute (ADR 0042). */
export const API_RATE_LIMITS: Record<OrgPlan, number> = {
  free: 60,
  team: 300,
  enterprise: 1200,
}
const RATE_WINDOW_MS = 60 * 1000

/**
 * A domain app's refusal (404 for another organization's id, 403 for the
 * owner's role, 422 for invalid input) keeps its status and code instead of
 * turning into a 500.
 */
export function apiError(error: unknown): AppError {
  if (error instanceof DomainClientError && error.status < 500) {
    return new AppError(error.code as ErrorCode, error.message, {
      status: error.status,
    })
  }
  return toAppError(error)
}

/** `{ data }` with no caching: every response is per token. */
export function apiJson(data: unknown, init: { status?: number } = {}) {
  return NextResponse.json(
    { data },
    { status: init.status, headers: { "Cache-Control": "no-store" } }
  )
}

/** `{ data, nextCursor }` for list endpoints (pagination is not used yet). */
export function apiList(data: unknown[]) {
  return NextResponse.json(
    { data, nextCursor: null },
    { headers: { "Cache-Control": "no-store" } }
  )
}

/** The `/api/v1` user agent sent to domain apps, so their audit rows name the token. */
export function apiUserAgent(token: VerifiedApiToken, request: Request) {
  const client = request.headers.get("user-agent")?.slice(0, 200)
  return `asynchrone-api (token ${token.prefix})${client ? ` ${client}` : ""}`
}

/**
 * Every `/api/v1` handler: bearer token → `apiAccess` → per-token rate limit →
 * scope. The owner's role is enforced afterwards by the service or domain app
 * that performs the work. Cookies are never read, so there is no CSRF surface.
 */
export function withApiToken<TParams = Record<string, never>>(
  route: string,
  scope: ApiTokenScope,
  handler: (
    token: VerifiedApiToken,
    request: Request,
    params: TParams
  ) => Promise<Response>
) {
  return withObservedRoute<{ params: Promise<TParams> }>(
    { app: "copilot", route },
    async (request, context) => {
      try {
        const token = await verifyApiToken(
          bearerToken(request.headers.get("authorization"))
        )
        const plan = await getOrganizationPlan(token.ctx.organizationId)
        if (!entitlementsFor(plan).apiAccess) throw upgradeRequired("apiAccess")
        await assertRateLimit(
          `api:${token.tokenId}`,
          API_RATE_LIMITS[plan],
          RATE_WINDOW_MS,
          { failOpen: false }
        )
        requireScope(token, scope)
        // Static routes have no params; Next still passes a context.
        const params = ((await context?.params) ?? {}) as TParams
        return await handler(token, request, params)
      } catch (error) {
        const appError = apiError(error)
        if (appError.status >= 500) console.error(error)
        return jsonError(appError)
      }
    }
  )
}

/** Reads a JSON body, or throws a 400. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new AppError("bad_request", "The body must be valid JSON.")
  }
}
