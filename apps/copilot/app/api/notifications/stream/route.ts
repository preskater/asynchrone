import { toAppError } from "@workspace/core/errors"
import { jsonError } from "@workspace/core/http"
import { eventStream } from "@workspace/realtime/server"

import { getRequestContext } from "@/lib/core/auth-context"
import { NOTIFICATIONS_TOPIC, realtimeHub } from "@/lib/realtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The bell's change stream (#98): a hint reaches only its recipient, in the
 * organization the session has open.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getRequestContext({ request })
    return eventStream(
      request,
      realtimeHub,
      (event) =>
        event.topic === NOTIFICATIONS_TOPIC &&
        event.organizationId === ctx.organizationId &&
        event.userId === ctx.userId
    )
  } catch (error) {
    return jsonError(toAppError(error))
  }
}
