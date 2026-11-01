import createMiddleware from "next-intl/middleware"
import { NextResponse, type NextRequest } from "next/server"

import { appOrigin } from "@workspace/contracts/server"
import { routing } from "@workspace/i18n/routing"

const intl = createMiddleware(routing)
const LOCALES = new Set<string>(routing.locales)

/**
 * Sections this app does not own. Employee screens link to Copilot for account
 * settings, the portal and the other domains, and old deep links may still
 * point at the employees host; both land on the owning app instead of a 404.
 */
const COPILOT_SECTIONS = new Set([
  // Calendars, files and messages still render in Copilot until #161/#162.
  "calendars",
  "files",
  "messages",
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
])

/** Moved to their own apps, served on their own hosts. */
const DOMAIN_ROUTES: Record<string, "projects" | "clients"> = {
  projects: "projects",
  clients: "clients",
  contacts: "clients",
  deals: "clients",
}

/**
 * The employees app owns `/{locale}/{orgSlug}/employees`. Everything else in
 * the workspace shape belongs to another app, so the proxy hands it over
 * before next-intl turns it into a locale-prefixed 404. `/hr` was the surface's
 * old name and redirects to `/employees` (ADR 0030).
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const segments = pathname.split("/").filter(Boolean)
  const [maybeLocale, , section] = segments
  const hasLocale = Boolean(maybeLocale && LOCALES.has(maybeLocale))

  if (hasLocale && section) {
    if (section === "hr") {
      const mapped = pathname.replace(/\/hr(?=\/|$)/, "/employees")
      return NextResponse.redirect(
        new URL(`${mapped}${search}`, request.url),
        308
      )
    }

    const domain = DOMAIN_ROUTES[section]
    if (domain) {
      return NextResponse.redirect(
        new URL(`${pathname}${search}`, appOrigin(domain)),
        308
      )
    }
    if (COPILOT_SECTIONS.has(section)) {
      return NextResponse.redirect(
        new URL(`${pathname}${search}`, appOrigin("copilot")),
        308
      )
    }
  }

  return intl(request)
}

export const config = {
  matcher: "/((?!api|_next|.*\\..*).*)",
}
