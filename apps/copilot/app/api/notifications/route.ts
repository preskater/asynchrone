import { NextResponse } from "next/server"

import { toAppError } from "@workspace/core/errors"
import { jsonError } from "@workspace/core/http"

import { getRequestContext } from "@/lib/core/auth-context"
import { notificationService } from "@/lib/notifications"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The bell's read after a real-time hint (#98). A route handler, not a server
 * action: an action response applies an RSC payload and can abort an
 * in-flight navigation (#171).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getRequestContext({ request })
    return NextResponse.json(await notificationService.list(ctx), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return jsonError(toAppError(error))
  }
}
