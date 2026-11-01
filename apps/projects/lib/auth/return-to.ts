import { safeRedirect } from "@workspace/core/redirect"
import { parseCookieHeader, serializeCookie } from "@workspace/oidc"

import { env } from "@/lib/env"

const secure = env.PROJECTS_APP_URL.startsWith("https://")

/**
 * Where to send the user after the callback.
 *
 * Host-only and short-lived; it holds a path, never a token or a full URL, and
 * is re-validated with `safeRedirect` when read.
 */
export const returnToCookieName = `${
  secure ? "__Host-" : ""
}asynchrone_return_to`

export function serializeReturnTo(path: string): string {
  return serializeCookie(returnToCookieName, path, {
    maxAgeSeconds: 10 * 60,
    secure,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  })
}

export function clearReturnTo(): string {
  return serializeCookie(returnToCookieName, "", {
    maxAgeSeconds: 0,
    secure,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  })
}

/** The stored return path, or `fallback` when it is missing or unsafe. */
export function readReturnTo(
  cookieHeader: string | null,
  fallback = "/"
): string {
  const path = parseCookieHeader(cookieHeader)[returnToCookieName]
  return safeRedirect(path, fallback)
}
