import createMiddleware from "next-intl/middleware"
import { NextResponse, type NextRequest } from "next/server"

import { appOrigin } from "@workspace/contracts/server"
import { routing } from "@workspace/i18n/routing"

const intl = createMiddleware(routing)
const LOCALES = new Set<string>(routing.locales)

/**
 * Sections this app does not own. Client screens link to Copilot for account
 * settings, the portal and the other domains, and old deep links may still
 * point at the clients host; both land on the owning app instead of a 404.
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
const DOMAIN_ROUTES: Record<string, "projects" | "employees"> = {
  projects: "projects",
  employees: "employees",
}

/**
 * The clients app owns `/{locale}/{orgSlug}/clients`, `/contacts` and
 * `/deals`. Everything else in the workspace shape belongs to another app, so
 * the proxy hands it over before next-intl turns it into a locale-prefixed
 * 404.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const segments = pathname.split("/").filter(Boolean)
  const [maybeLocale, , section] = segments
  const hasLocale = Boolean(maybeLocale && LOCALES.has(maybeLocale))

  if (hasLocale && section) {
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
  matcher: "/((?!api|internal|_next|.*\\..*).*)",
}
