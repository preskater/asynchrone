import createMiddleware from "next-intl/middleware"
import { NextResponse, type NextRequest } from "next/server"

import { appOrigin } from "@workspace/contracts/server"
import { routing } from "@workspace/i18n/routing"

const intl = createMiddleware(routing)
const LOCALES = new Set<string>(routing.locales)

/**
 * Sections this app does not own. The messages app only serves the
 * conversations; account settings, the other domains and the portal stay on
 * Copilot (or the app that owns them after #161–#164), so old deep links land
 * there instead of a 404.
 */
const COPILOT_SECTIONS = new Set([
  "settings",
  "search",
  "help",
  "feedback",
  "portal",
  "onboarding",
  "accept-invitation",
  "consent",
  "two-factor",
  "select-organization",
  "projects",
  "calendars",
  "files",
  "clients",
  "employees",
])

/**
 * The messages app owns `/{locale}/{orgSlug}/messages`. Everything else in the
 * workspace shape belongs to another app, so the proxy hands it to Copilot
 * before next-intl turns it into a locale-prefixed 404.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const segments = pathname.split("/").filter(Boolean)
  const [maybeLocale, , section] = segments
  const hasLocale = Boolean(maybeLocale && LOCALES.has(maybeLocale))

  if (hasLocale && section && COPILOT_SECTIONS.has(section)) {
    return NextResponse.redirect(
      new URL(`${pathname}${search}`, appOrigin("copilot")),
      308
    )
  }

  return intl(request)
}

export const config = {
  matcher: "/((?!api|_next|.*\\..*).*)",
}
