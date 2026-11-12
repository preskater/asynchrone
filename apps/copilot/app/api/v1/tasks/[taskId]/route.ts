import {
  apiJson,
  apiUserAgent,
  readJson,
  withApiToken,
  withTaskUrls,
} from "@/lib/api/v1"
import { ApiTaskSchema, UpdateTaskBodySchema } from "@/lib/api/schemas"
import { callDomain, delegatedContext } from "@/lib/internal/domain"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Updates the given fields of a task; omitted fields are left unchanged. */
export const PATCH = withApiToken<{ taskId: string }>(
  "/api/v1/tasks/[taskId]",
  "tasks:write",
  async (token, request, { taskId }) => {
    const patch = UpdateTaskBodySchema.parse(await readJson(request))
    const task = await callDomain(
      "projects",
      "update-task",
      delegatedContext(token.ctx),
      { taskId, ...patch },
      ApiTaskSchema,
      {
        userAgent: apiUserAgent(token, request),
        idempotencyKey:
          request.headers.get("idempotency-key")?.slice(0, 200) || undefined,
      }
    )
    const [withUrl] = await withTaskUrls(token, [task])
    return apiJson(withUrl)
  }
)
