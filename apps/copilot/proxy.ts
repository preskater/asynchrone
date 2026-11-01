import createMiddleware from "next-intl/middleware"
import { NextResponse, type NextRequest } from "next/server"

import { appOrigin } from "@workspace/contracts/server"
import { routing } from "@workspace/i18n/routing"

const intl = createMiddleware(routing)
const LOCALES = new Set<string>(routing.locales)

/**
 * Copilot no longer serves the project screens (#160).
 *
 * Old `/{locale}/{orgSlug}/projects[/...]` bookmarks, notification links and
 * search hits are redirected to the projects host with the same path, so the
 * projects app's URLs are unchanged and no link needs rewriting.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const segments = pathname.split("/").filter(Boolean)
  const [locale, , section] = segments

  if (locale && LOCALES.has(locale) && section === "projects") {
    return NextResponse.redirect(
      new URL(`${pathname}${search}`, appOrigin("projects")),
      308
    )
  }

  return intl(request)
}

export const config = {
  matcher: "/((?!api|internal|mcp|_next|.*\\..*).*)",
}
