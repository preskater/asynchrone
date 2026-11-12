import { z } from "zod"

import { apiList, apiUserAgent, withApiToken } from "@/lib/api/v1"
import { ApiProjectSchema, ProjectShellSchema } from "@/lib/api/schemas"
import { callDomain, delegatedContext } from "@/lib/internal/domain"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Projects of the token's organization, each with its labels. */
export const GET = withApiToken(
  "/api/v1/projects",
  "projects:read",
  async (token, request) => {
    const { projects, labels } = await callDomain(
      "projects",
      "list-project-shell",
      delegatedContext(token.ctx),
      {},
      ProjectShellSchema,
      { userAgent: apiUserAgent(token, request) }
    )
    const byId = new Map(labels.map((label) => [label.id, label]))
    return apiList(
      z.array(ApiProjectSchema).parse(
        projects.map(({ labelIds, ...project }) => ({
          ...project,
          labels: labelIds.flatMap((id) => byId.get(id) ?? []),
        }))
      )
    )
  }
)
