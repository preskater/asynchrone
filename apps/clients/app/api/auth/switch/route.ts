import { NextResponse, type NextRequest } from "next/server"

import { safeRedirect } from "@workspace/core/redirect"

import { clearReturnTo } from "@/lib/auth/return-to"
import { env } from "@/lib/env"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const LOCALES = new Set(["en", "fr"])

/**
 * Organization switch handoff.
 *
 * The Copilot session owns the active organization and this app's access token
 * is bound to it, so switching is a new authorization. Copilot changes the
 * active organization (it owns the session cookie) and sends the user back into
 * this app's sign-in flow with the original return path.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const organizationId = url.searchParams.get("organizationId")
  const localeParam = url.searchParams.get("locale")
  const locale = localeParam && LOCALES.has(localeParam) ? localeParam : "en"
  const returnTo = safeRedirect(url.searchParams.get("returnTo"), "/")

  const signIn = new URL("/api/auth/sign-in", env.CLIENTS_APP_URL)
  signIn.searchParams.set("returnTo", returnTo)

  const target = new URL(`/${locale}/select-organization`, env.COPILOT_APP_URL)
  target.searchParams.set("redirectTo", signIn.toString())
  if (organizationId) target.searchParams.set("organizationId", organizationId)

  const response = NextResponse.redirect(target)
  response.headers.append("Set-Cookie", clearReturnTo())
  response.headers.append("Cache-Control", "no-store")
  return response
}
