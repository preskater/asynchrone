import { NextResponse } from "next/server"

import { toAppError } from "@workspace/core/errors"
import { jsonError } from "@workspace/core/http"

import { messagingService } from "@/lib/messaging"
import { getRequestContext } from "@/lib/request-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The conversation sidebar's polling read.
 *
 * The client store polls every five seconds; this is a route handler rather
 * than a server action so the response never applies an RSC payload through
 * the router (it would reset the store and can abort a navigation). The
 * organization comes from the OIDC session, never from the request.
 */
export async function GET() {
  try {
    const ctx = await getRequestContext()
    return NextResponse.json(await messagingService.list(ctx))
  } catch (error) {
    return jsonError(toAppError(error))
  }
}
