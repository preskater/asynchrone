import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { rejectCrossOrigin } from "@workspace/core/http"
import { revokeAppSessions } from "@/lib/internal/app-sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Ends an impersonated session and returns the operator to the control tower.
 * The operator's control-tower session is a separate cookie and is untouched.
 *
 * The session is deleted through Better Auth's internal adapter, not with a
 * direct Prisma delete: that is what fires `session.delete.after`, which
 * dispatches the signed back-channel logout token to every app. The explicit
 * fan-out is the belt-and-braces path if a client was not delivered.
 */
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request)
  if (blocked) return blocked

  const session = await auth.api.getSession({ headers: await headers() })

  if (!session || !session.session.impersonatedBy) {
    return NextResponse.redirect(new URL("/", process.env.BETTER_AUTH_URL))
  }

  const sid = session.session.id
  const context = await auth.$context
  await context.internalAdapter
    .deleteSession(session.session.token)
    .catch((error: unknown) => {
      console.error("[platform] failed to end impersonation session", error)
    })
  await revokeAppSessions(sid)

  const destination = (process.env.CONTROL_TOWER_URL ??
    process.env.BETTER_AUTH_URL)!.replace(/\/$/, "")

  const response = NextResponse.redirect(new URL("/overview", destination))
  response.cookies.delete(context.authCookies.sessionToken.name)
  return response
}
