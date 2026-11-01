import { NextResponse } from "next/server"

import { buildEndSessionUrl, clearSessionCookie } from "@workspace/oidc"

import { readSessionRecord } from "@/lib/auth/session"
import { env } from "@/lib/env"
import { oidcConfig, sessionStore } from "@/lib/oidc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Sign out everywhere.
 *
 * The local row and cookie go first, then Copilot's end-session endpoint ends
 * the Copilot session so the next sign-in is not silent. The registered
 * post-logout URI is the app origin.
 */
export async function GET() {
  const session = await readSessionRecord()
  if (session) await sessionStore.deleteBySid(session.sid)

  const response = NextResponse.redirect(
    buildEndSessionUrl(oidcConfig, {
      postLogoutRedirectUri: env.CALENDARS_APP_URL,
    })
  )
  response.headers.append("Set-Cookie", clearSessionCookie(oidcConfig))
  response.headers.append("Cache-Control", "no-store")
  return response
}
