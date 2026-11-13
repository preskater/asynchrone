import { toAppError } from "@workspace/core/errors"
import { jsonError } from "@workspace/core/http"
import { eventStream } from "@workspace/realtime/server"

import { TASK_COMMENTS_TOPIC, realtimeHub } from "@/lib/realtime"
import { getRequestContext } from "@/lib/request-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The task screens' change stream (#98): "a task comment was added in your
 * organization". The open task then re-reads its comments through
 * `/api/tasks/:taskId/comments`. The organization comes from the session.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getRequestContext()
    return eventStream(
      request,
      realtimeHub,
      (event) =>
        event.topic === TASK_COMMENTS_TOPIC &&
        event.organizationId === ctx.organizationId
    )
  } catch (error) {
    return jsonError(toAppError(error))
  }
}
