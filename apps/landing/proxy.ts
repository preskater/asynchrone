import createMiddleware from "next-intl/middleware"
import { NextResponse, type NextRequest } from "next/server"

import { routing } from "@workspace/i18n/routing"

import { legacyCopilotTarget, workspaceUrl } from "./lib/workspace"

// The landing has its own middleware policy: no locale cookie and no
// Accept-Language detection. With `localePrefix: "always"` the prefix already
// selects the language, and the marketing site must not set any cookie.
// (`createMiddleware` reads the policy from the routing object it is given, so
// the shared `@workspace/i18n/routing` is not changed for the workspace apps.)
const intl = createMiddleware({
  ...routing,
  localeCookie: false,
  localeDetection: false,
})

/**
 * The landing owns the apex (`asynchrone.space`). Auth, onboarding, settings
 * and portal routes used to live here; after #175 they are served by Copilot.
 * Redirect them before next-intl turns the path into a locale-prefixed 404,
 * keep the original locale and query string, and leave every marketing page to
 * the i18n middleware.
 *
 * This middleware never reads a session and never sets a cookie (not even the
 * next-intl locale cookie): the landing is anonymous marketing only.
 */
export default function proxy(request: NextRequest) {
  const target = legacyCopilotTarget(
    request.nextUrl.pathname,
    request.nextUrl.search
  )

  if (target) {
    return NextResponse.redirect(new URL(target, workspaceUrl), 308)
  }

  return intl(request)
}

export const config = {
  // Exclude Next.js internals and static files; everything else goes through
  // the legacy redirect check and then the locale middleware.
  matcher: "/((?!_next|.*\\..*).*)",
}
