import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { rejectCrossOrigin } from "@workspace/core/http"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Ends an impersonated session and returns the operator to the control tower.
 * The operator's control-tower session is a separate cookie and is untouched.
 */
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request)
  if (blocked) return blocked

  const session = await auth.api.getSession({ headers: await headers() })

  if (!session || !session.session.impersonatedBy) {
    return NextResponse.redirect(new URL("/", process.env.BETTER_AUTH_URL))
  }

  await prisma.session
    .delete({ where: { id: session.session.id } })
    .catch(() => {})

  const destination = (
    process.env.CONTROL_TOWER_URL ?? process.env.BETTER_AUTH_URL
  )!.replace(/\/$/, "")

  const response = NextResponse.redirect(new URL("/overview", destination))
  const context = await auth.$context
  response.cookies.delete(context.authCookies.sessionToken.name)
  return response
}
