import createMiddleware from "next-intl/middleware"
import { NextResponse, type NextRequest } from "next/server"

import type { AppKey } from "@workspace/contracts"
import { appOrigin } from "@workspace/contracts/server"
import { routing } from "@workspace/i18n/routing"

const intl = createMiddleware(routing)
const LOCALES = new Set<string>(routing.locales)

/**
 * Copilot no longer serves the screens that moved to a domain app.
 *
 * Old `/{locale}/{orgSlug}/<section>[/...]` bookmarks, notification links and
 * search hits are redirected to the app that owns them with the same path, so
 * its URLs are unchanged and no link needs rewriting.
 */
const MOVED_SECTIONS: Partial<Record<string, AppKey>> = {
  // Projects moved in #160.
  projects: "projects",
  // Messaging moved in #162.
  messages: "messages",
}

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const segments = pathname.split("/").filter(Boolean)
  const [locale, , section] = segments

  const app = section ? MOVED_SECTIONS[section] : undefined
  if (locale && LOCALES.has(locale) && app) {
    return NextResponse.redirect(
      new URL(`${pathname}${search}`, appOrigin(app)),
      308
    )
  }

  return intl(request)
}

export const config = {
  matcher: "/((?!api|internal|mcp|_next|.*\\..*).*)",
}
