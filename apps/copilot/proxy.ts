import createMiddleware from "next-intl/middleware"

import { routing } from "@workspace/i18n/routing"

export default createMiddleware(routing)

export const config = {
  matcher: "/((?!api|internal|mcp|_next|.*\\..*).*)",
}
