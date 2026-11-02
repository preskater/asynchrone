import { NextResponse } from "next/server"

import { toAppError } from "@workspace/core/errors"
import { jsonError } from "@workspace/core/http"

import { messagingService } from "@/lib/messaging"
import { getRequestContext } from "@/lib/request-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * One page of a conversation for the polling read and "load earlier".
 *
 * A route handler (not a server action), for the same reason as
 * `/api/messages/snapshot`: the five-second poll must not re-render the route
 * (#171). The conversation lookup is organization-scoped, so another
 * organization's id is a 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const ctx = await getRequestContext()
    const { conversationId } = await params
    const cursor = new URL(request.url).searchParams.get("cursor")
    return NextResponse.json(
      await messagingService.listMessages(ctx, conversationId, { cursor })
    )
  } catch (error) {
    return jsonError(toAppError(error))
  }
}
