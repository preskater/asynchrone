import createMiddleware from "next-intl/middleware"

import { routing } from "@workspace/i18n/routing"

/**
 * The landing has no API routes, so every path except Next.js internals and
 * static files goes through the locale prefix.
 */
export default createMiddleware(routing)

export const config = {
  matcher: "/((?!_next|.*\\..*).*)",
}
