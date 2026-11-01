import { isAppError } from "@workspace/core/errors"
import { jsonError, rejectCrossOrigin } from "@workspace/core/http"

import { deleteConversation } from "@/lib/assistant/conversations"
import { assistantRequestContext } from "@/lib/assistant/context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ conversationId: string }> }

/**
 * Deletes one of the signed-in user's conversations. Foreign, unknown and
 * already-deleted ids are a `404`, so the endpoint never reveals whether
 * another member's conversation exists.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const blocked = rejectCrossOrigin(request)
  if (blocked) return blocked

  try {
    const ctx = await assistantRequestContext(request)
    const { conversationId } = await context.params
    await deleteConversation(ctx, conversationId)
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (isAppError(error)) return jsonError(error)
    throw error
  }
}
