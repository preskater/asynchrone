import createMiddleware from "next-intl/middleware"
import { NextResponse, type NextRequest } from "next/server"

import { withCorrelation } from "@workspace/observability/next"

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
  // Calendars (with meetings) and files (with the upload/download APIs) moved
  // in #161.
  calendars: "calendars",
  files: "files",
  // Messaging moved in #162.
  messages: "messages",
  // Clients and employees moved in #163.
  clients: "clients",
  contacts: "clients",
  deals: "clients",
  employees: "employees",
  // `/hr` was the employees surface's old name (ADR 0030); it lands on the
  // employees host's `/employees` screen.
  hr: "employees",
}

function handleRequest(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const segments = pathname.split("/").filter(Boolean)
  const [locale, , section] = segments

  const app = section ? MOVED_SECTIONS[section] : undefined
  if (locale && LOCALES.has(locale) && app) {
    const path =
      section === "hr"
        ? pathname.replace(/\/hr(?=\/|$)/, "/employees")
        : pathname
    return NextResponse.redirect(
      new URL(`${path}${search}`, appOrigin(app)),
      308
    )
  }

  return intl(request)
}

/**
 * Adopt or mint the correlation id for every page request (issue #170),
 * echo it on the response and keep it in a host-only cookie so a
 * cross-app link can carry it as `?rid=`.
 */
export default function proxy(request: NextRequest) {
  return withCorrelation(request, handleRequest(request))
}

export const config = {
  matcher: "/((?!api|internal|mcp|_next|.*\\..*).*)",
}
