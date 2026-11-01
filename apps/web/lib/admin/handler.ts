import {
  AdminBanInputSchema,
  AdminHandoffInputSchema,
  AdminOAuthClientDisabledInputSchema,
  AdminPlanInputSchema,
  AdminTrialInputSchema,
  INTERNAL_API_VERSION,
} from "@workspace/contracts"

import type { AdminRepository } from "./repository"

export interface AdminHandlerOptions {
  segments: string[]
  request: Request
  authorize: () => Promise<unknown>
  repository: AdminRepository
}

function envelope(data: unknown, status = 200): Response {
  return Response.json(
    {
      data,
      meta: {
        app: "copilot",
        version: INTERNAL_API_VERSION,
        requestId: crypto.randomUUID(),
      },
    },
    { status, headers: { "Cache-Control": "no-store" } }
  )
}

function error(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  )
}

function isHttpError(value: unknown): value is {
  status: number
  code: string
  message: string
} {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { status?: unknown }).status === "number" &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  )
}

function query(request: Request): {
  query?: string
  cursor?: string | null
  offset?: number
  limit?: number
} {
  const search = new URL(request.url).searchParams
  const limit = search.get("limit")
  const offset = search.get("offset")
  return {
    query: search.get("query") ?? undefined,
    cursor: search.get("cursor"),
    offset: offset ? Number(offset) : undefined,
    limit: limit ? Number(limit) : undefined,
  }
}

function limit(request: Request): number | undefined {
  const value = new URL(request.url).searchParams.get("limit")
  return value ? Number(value) : undefined
}

async function body<T>(
  request: Request,
  schema: { parse: (value: unknown) => T }
): Promise<T> {
  return schema.parse(await request.json())
}

/**
 * Pure admin request handler. The route supplies the service-token check and
 * the identity repository, so the same logic is unit-testable.
 */
export async function handleAdminRequest({
  segments,
  request,
  authorize,
  repository,
}: AdminHandlerOptions): Promise<Response> {
  try {
    await authorize()
  } catch (cause) {
    if (isHttpError(cause)) {
      return error(cause.status, cause.code, cause.message)
    }
    return error(401, "unauthorized", "A valid service token is required")
  }

  const [resource, id, action] = segments
  const method = request.method.toUpperCase()

  try {
    if (resource === "organizations" && !id && method === "GET") {
      return envelope(await repository.listOrganizations(query(request)))
    }

    if (resource === "organizations" && id && !action && method === "GET") {
      const organization = await repository.getOrganization(id)
      return organization
        ? envelope(organization)
        : error(404, "not_found", "Organization not found")
    }

    if (
      resource === "organizations" &&
      id &&
      action === "detail" &&
      method === "GET"
    ) {
      const organization = await repository.getOrganizationDetail(id)
      return organization
        ? envelope(organization)
        : error(404, "not_found", "Organization not found")
    }

    if (resource === "overview" && !id && method === "GET") {
      return envelope(await repository.overview())
    }

    if (resource === "ops" && !id && method === "GET") {
      return envelope(await repository.ops())
    }

    if (resource === "audit" && !id && method === "GET") {
      return envelope(await repository.listAudit({ limit: limit(request) }))
    }

    if (
      resource === "organizations" &&
      id &&
      action === "plan" &&
      method === "POST"
    ) {
      const organization = await repository.updatePlan(
        id,
        await body(request, AdminPlanInputSchema)
      )
      return organization
        ? envelope(organization)
        : error(404, "not_found", "Organization not found")
    }

    if (
      resource === "organizations" &&
      id &&
      action === "release-plan" &&
      method === "POST"
    ) {
      const organization = await repository.releasePlan(id)
      return organization
        ? envelope(organization)
        : error(404, "not_found", "Organization not found")
    }

    if (
      resource === "organizations" &&
      id &&
      action === "trial" &&
      method === "POST"
    ) {
      const organization = await repository.setTrial(
        id,
        await body(request, AdminTrialInputSchema)
      )
      return organization
        ? envelope(organization)
        : error(404, "not_found", "Organization not found")
    }

    if (resource === "users" && !id && method === "GET") {
      return envelope(await repository.listUsers(query(request)))
    }

    if (resource === "users" && id && !action && method === "GET") {
      const user = await repository.getUser(id)
      return user ? envelope(user) : error(404, "not_found", "User not found")
    }

    if (resource === "users" && id && action === "detail" && method === "GET") {
      const user = await repository.getUserDetail(id)
      return user ? envelope(user) : error(404, "not_found", "User not found")
    }

    if (resource === "users" && id && action === "ban" && method === "POST") {
      const user = await repository.setBan(
        id,
        await body(request, AdminBanInputSchema)
      )
      return user ? envelope(user) : error(404, "not_found", "User not found")
    }

    if (
      resource === "users" &&
      id &&
      action === "sessions" &&
      method === "POST"
    ) {
      return envelope(await repository.revokeSessions(id))
    }

    if (resource === "handoffs" && method === "POST") {
      return envelope(
        await repository.createHandoff(
          await body(request, AdminHandoffInputSchema)
        )
      )
    }

    if (resource === "oauth-clients" && id && !action && method === "GET") {
      const client = await repository.getOAuthClient(id)
      return client
        ? envelope(client)
        : error(404, "not_found", "OAuth client not found")
    }

    if (resource === "oauth-clients" && id && !action && method === "POST") {
      const client = await repository.setOAuthClientDisabled(
        id,
        await body(request, AdminOAuthClientDisabledInputSchema)
      )
      return client
        ? envelope(client)
        : error(404, "not_found", "OAuth client not found")
    }

    return error(404, "not_found", "Admin endpoint not found")
  } catch (cause) {
    if (isHttpError(cause)) {
      return error(cause.status, cause.code, cause.message)
    }
    if (
      cause instanceof Error &&
      (cause.message === "User not found" ||
        cause.message === "Banned accounts cannot be impersonated")
    ) {
      return error(400, "validation_error", cause.message)
    }
    if (cause instanceof SyntaxError) {
      return error(400, "validation_error", "Invalid JSON body")
    }
    if (typeof cause === "object" && cause !== null && "issues" in cause) {
      return error(400, "validation_error", "Invalid admin request")
    }
    console.error("[admin] request failed", cause)
    return error(500, "internal_error", "Admin request failed")
  }
}
