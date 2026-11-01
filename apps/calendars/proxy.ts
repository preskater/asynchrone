import createMiddleware from "next-intl/middleware"
import { NextResponse, type NextRequest } from "next/server"

import { appOrigin } from "@workspace/contracts/server"
import { routing } from "@workspace/i18n/routing"

const intl = createMiddleware(routing)
const LOCALES = new Set<string>(routing.locales)

/**
 * Sections this app does not own.
 *
 * Calendar screens link to Copilot for account settings, clients and the
 * portal, and old deep links may still point at the calendars host; both land
 * on the app that owns the section instead of a 404.
 */
const COPILOT_SECTIONS = new Set([
  "settings",
  "clients",
  "employees",
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

/** Domain apps that own their own host. */
const DOMAIN_SECTIONS: Record<string, "projects" | "messages" | "files"> = {
  projects: "projects",
  messages: "messages",
  files: "files",
}

/**
 * The calendars app owns `/{locale}/{orgSlug}/calendars`. Everything else in
 * the workspace shape belongs to another app, so the proxy hands it over
 * before next-intl turns it into a locale-prefixed 404.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const segments = pathname.split("/").filter(Boolean)
  const [maybeLocale, , section] = segments
  const hasLocale = Boolean(maybeLocale && LOCALES.has(maybeLocale))

  if (hasLocale && section) {
    const domain = DOMAIN_SECTIONS[section]
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
