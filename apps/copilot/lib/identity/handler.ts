import { z } from "zod"

import {
  AddWorkspaceMemberSchema,
  INTERNAL_API_VERSION,
  InternalErrorSchema,
  MemberSchema,
  OrganizationSchema,
  EntitlementsSchema,
  PortalAccessSchema,
  PresenceEntrySchema,
  SERVICE_SCOPES,
  UpdateWorkspaceMemberSchema,
  UserSchema,
  WorkspaceSchema,
  type ServiceScope,
} from "@workspace/contracts"

import { ServiceAuthError } from "@workspace/service-auth"

import type { IdentityRepository } from "./repository"

export interface IdentityHandlerOptions {
  segments: string[]
  request: Request
  authorize: (scope: ServiceScope) => Promise<unknown>
  repository: IdentityRepository
}

function envelope<T>(data: T, cache = true): Response {
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
        "Cache-Control": cache ? "private, max-age=30" : "no-store",
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

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw Object.assign(new Error("A JSON body is required"), {
      status: 400,
      code: "validation_error",
    })
  }
}

function validation(cause: unknown): Response {
  const maybe = cause as { status?: unknown; code?: unknown } | null
  const message =
    cause instanceof Error ? cause.message : "Invalid request payload"
  if (typeof maybe?.status === "number" && typeof maybe.code === "string") {
    return error(maybe.status, maybe.code, message)
  }
  return error(400, "validation_error", message)
}

/** Pure request handler; the route wires the verifier and the identity client. */
export async function handleIdentityRequest({
  segments,
  request,
  authorize,
  repository,
}: IdentityHandlerOptions): Promise<Response> {
  const method = request.method.toUpperCase()
  const scope: ServiceScope =
    method === "GET" ? SERVICE_SCOPES.identityRead : SERVICE_SCOPES.identityWrite

  try {
    await authorize(scope)
  } catch (cause) {
    if (cause instanceof ServiceAuthError) {
      return error(cause.status, cause.code, cause.message)
    }
    return error(401, "unauthorized", "A valid service token is required")
  }

  const [resource, id, subresource, extra] = segments
  try {
    if (resource === "workspace" && method === "GET") {
      const search = new URL(request.url).searchParams
      const sid = search.get("sid")
      const organizationId = search.get("organizationId")
      if (!sid || !organizationId) {
        return error(
          400,
          "validation_error",
          "sid and organizationId are required"
        )
      }
      const workspace = await repository.getWorkspace(sid, organizationId)
      if (!workspace) {
        return error(404, "not_found", "Workspace not found")
      }
      return envelope(WorkspaceSchema.parse(workspace))
    }

    if (resource === "organizations" && id && !subresource) {
      if (method !== "GET") {
        return error(405, "method_not_allowed", "Method not allowed")
      }
      const organization = await repository.getOrganization(id)
      if (!organization)
        return error(404, "not_found", "Organization not found")
      return envelope(OrganizationSchema.parse(organization))
    }

    if (resource === "organizations" && id && subresource === "members") {
      if (extra) {
        if (method === "PATCH") {
          const input = UpdateWorkspaceMemberSchema.parse(
            await readJson(request)
          )
          const member = await repository.updateMemberRole(id, extra, input)
          return envelope(MemberSchema.parse(member), false)
        }
        if (method === "DELETE") {
          return envelope(await repository.removeMember(id, extra), false)
        }
        return error(405, "method_not_allowed", "Method not allowed")
      }
      if (method === "POST") {
        const input = AddWorkspaceMemberSchema.parse(await readJson(request))
        const member = await repository.addMember(id, input)
        return envelope(MemberSchema.parse(member), false)
      }
      const members = await repository.listMembers(id)
      return envelope(MemberSchema.array().parse(members))
    }

    if (resource === "organizations" && id && subresource === "portal-access") {
      if (method !== "GET") {
        return error(405, "method_not_allowed", "Method not allowed")
      }
      const clientId = new URL(request.url).searchParams.get("clientId")
      if (!clientId) {
        return error(400, "validation_error", "clientId is required")
      }
      const access = await repository.getPortalAccess(id, clientId)
      return envelope(PortalAccessSchema.parse(access))
    }

    if (resource === "organizations" && id && subresource === "presence") {
      if (method !== "GET") {
        return error(405, "method_not_allowed", "Method not allowed")
      }
      const presence = await repository.listPresence(id)
      return envelope(
        PresenceEntrySchema.array().parse(presence)
      )
    }

    if (resource === "organizations" && id && subresource === "appearance") {
      if (method !== "GET") {
        return error(405, "method_not_allowed", "Method not allowed")
      }
      const appearance = await repository.getAppearance(id)
      if (!appearance) {
        return error(404, "not_found", "Organization not found")
      }
      return envelope(appearance)
    }

    if (resource === "organizations" && id && subresource === "entitlements") {
      if (method !== "GET") {
        return error(405, "method_not_allowed", "Method not allowed")
      }
      const entitlements = await repository.getEntitlements(id)
      if (!entitlements)
        return error(404, "not_found", "Organization not found")
      return envelope(EntitlementsSchema.parse(entitlements))
    }

    if (resource === "users" && id && !subresource && method === "GET") {
      const user = await repository.getUser(id)
      if (!user) return error(404, "not_found", "User not found")
      return envelope(UserSchema.parse(user))
    }

    if (
      resource === "users" &&
      id &&
      subresource === "integration-tokens" &&
      extra &&
      method === "GET"
    ) {
      const token = await repository.getIntegrationToken(id, extra)
      return envelope(token)
    }

    if (
      resource === "users" &&
      id &&
      subresource === "presence" &&
      method === "POST"
    ) {
      return envelope(await repository.touchPresence(id), false)
    }

    return error(404, "not_found", "Internal endpoint not found")
  } catch (cause) {
    if (
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      "status" in cause
    ) {
      return validation(cause)
    }
    if (cause instanceof z.ZodError) {
      return error(400, "validation_error", "Invalid request payload")
    }
    console.error("[identity] internal request failed", cause)
    return error(500, "internal_error", "Identity request failed")
  }
}
