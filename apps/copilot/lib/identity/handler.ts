import {
  INTERNAL_API_VERSION,
  InternalErrorSchema,
  MemberSchema,
  OrganizationSchema,
  EntitlementsSchema,
  UserSchema,
} from "@workspace/contracts"

import { ServiceAuthError } from "@workspace/service-auth"

import type { IdentityRepository } from "./repository"

export interface IdentityHandlerOptions {
  segments: string[]
  request: Request
  authorize: () => Promise<unknown>
  repository: IdentityRepository
}

function envelope<T>(data: T): Response {
  return Response.json(
    {
      data,
      meta: {
        app: "copilot",
        version: INTERNAL_API_VERSION,
        requestId: crypto.randomUUID(),
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30",
        "Content-Type": "application/json",
      },
    }
  )
}

function error(status: number, code: string, message: string): Response {
  return Response.json(
    { error: InternalErrorSchema.parse({ code, message }) },
    { status, headers: { "Cache-Control": "no-store" } }
  )
}

/** Pure request handler; the route wires the verifier and the identity client. */
export async function handleIdentityRequest({
  segments,
  authorize,
  repository,
}: IdentityHandlerOptions): Promise<Response> {
  try {
    await authorize()
  } catch (cause) {
    if (cause instanceof ServiceAuthError) {
      return error(cause.status, cause.code, cause.message)
    }
    return error(401, "unauthorized", "A valid service token is required")
  }

  const [resource, id, subresource] = segments
  try {
    if (resource === "organizations" && id && !subresource) {
      const organization = await repository.getOrganization(id)
      if (!organization)
        return error(404, "not_found", "Organization not found")
      return envelope(OrganizationSchema.parse(organization))
    }

    if (resource === "organizations" && id && subresource === "members") {
      const members = await repository.listMembers(id)
      return envelope(MemberSchema.array().parse(members))
    }

    if (resource === "organizations" && id && subresource === "entitlements") {
      const entitlements = await repository.getEntitlements(id)
      if (!entitlements)
        return error(404, "not_found", "Organization not found")
      return envelope(EntitlementsSchema.parse(entitlements))
    }

    if (resource === "users" && id && !subresource) {
      const user = await repository.getUser(id)
      if (!user) return error(404, "not_found", "User not found")
      return envelope(UserSchema.parse(user))
    }

    return error(404, "not_found", "Internal endpoint not found")
  } catch (cause) {
    console.error("[identity] internal request failed", cause)
    return error(500, "internal_error", "Identity request failed")
  }
}
