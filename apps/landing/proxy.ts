import createMiddleware from "next-intl/middleware"
import { NextResponse, type NextRequest } from "next/server"

import { routing } from "@workspace/i18n/routing"

import { isLegacyCopilotPath, workspaceUrl } from "./lib/workspace"

const intl = createMiddleware(routing)
const LOCALES = new Set<string>(routing.locales)

/**
 * The landing owns the apex (`asynchrone.space`). Auth, onboarding and portal
 * routes used to live here; after #175 they are served by Copilot. Redirect
 * them before next-intl turns the path into a locale-prefixed 404, keep the
 * original locale, and leave every marketing page to the i18n middleware.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const segments = pathname.split("/").filter(Boolean)
  const withoutLocale =
    segments[0] && LOCALES.has(segments[0]) ? segments.slice(1) : segments

  if (isLegacyCopilotPath(withoutLocale.join("/"))) {
    return NextResponse.redirect(
      new URL(`${pathname}${search}`, workspaceUrl),
      308
    )
  }

  return intl(request)
}

export const config = {
  // Exclude Next.js internals and static files; everything else goes through
  // the legacy redirect check and then the locale middleware.
  matcher: "/((?!_next|.*\\..*).*)",
}
