import { z } from "zod"

import {
  apiJson,
  apiList,
  apiUserAgent,
  readJson,
  withApiToken,
  withTaskUrls,
} from "@/lib/api/v1"
import {
  ApiTaskSchema,
  CreateTaskBodySchema,
  ListTasksQuerySchema,
} from "@/lib/api/schemas"
import { callDomain, delegatedContext } from "@/lib/internal/domain"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Tasks of one project: `GET /api/v1/tasks?projectId=…`. */
export const GET = withApiToken(
  "/api/v1/tasks",
  "tasks:read",
  async (token, request) => {
    const query = ListTasksQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    )
    return apiList(
      await withTaskUrls(
        token,
        await callDomain(
          "projects",
          "list-tasks",
          delegatedContext(token.ctx),
          query,
          z.array(ApiTaskSchema),
          { userAgent: apiUserAgent(token, request) }
        )
      )
    )
  }
)

/**
 * Creates a task with a native identifier. Never opens a repository issue
 * unless the body sets `createIssue: true`. Send `Idempotency-Key` to retry
 * safely.
 */
export const POST = withApiToken(
  "/api/v1/tasks",
  "tasks:write",
  async (token, request) => {
    const body = CreateTaskBodySchema.parse(await readJson(request))
    const task = await callDomain(
      "projects",
      "create-task",
      delegatedContext(token.ctx),
      body,
      ApiTaskSchema,
      {
        userAgent: apiUserAgent(token, request),
        idempotencyKey:
          request.headers.get("idempotency-key")?.slice(0, 200) || undefined,
      }
    )
    const [withUrl] = await withTaskUrls(token, [task])
    return apiJson(withUrl, { status: 201 })
  }
)
