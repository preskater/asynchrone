import { NextResponse } from "next/server"

import { toAppError } from "@workspace/core/errors"
import { jsonError, rejectCrossOrigin } from "@workspace/core/http"

import { messagingService } from "@/lib/messaging"
import { getRequestContext } from "@/lib/request-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The presence heartbeat.
 *
 * Coarse on purpose (the client writes at most once every 30 seconds), but it
 * is still a write: it rejects cross-origin requests and takes the actor from
 * the OIDC session. It is a route handler rather than a server action so the
 * heartbeat never competes with a navigation for the router (#171).
 */
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request)
  if (blocked) return blocked
  try {
    const ctx = await getRequestContext()
    await messagingService.touchPresence(ctx)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(toAppError(error))
  }
}
