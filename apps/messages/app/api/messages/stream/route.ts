import { toAppError } from "@workspace/core/errors"
import { jsonError } from "@workspace/core/http"
import { eventStream } from "@workspace/realtime/server"

import { MESSAGING_TOPIC, realtimeHub } from "@/lib/realtime"
import { getRequestContext } from "@/lib/request-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The messaging screens' change stream (#98). It only says "messaging changed
 * in your organization"; the store then re-reads `snapshot` and the open
 * conversation, which enforce membership. The organization comes from the
 * OIDC session, never from the request.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getRequestContext()
    return eventStream(
      request,
      realtimeHub,
      (event) =>
        event.topic === MESSAGING_TOPIC &&
        event.organizationId === ctx.organizationId
    )
  } catch (error) {
    return jsonError(toAppError(error))
  }
}
