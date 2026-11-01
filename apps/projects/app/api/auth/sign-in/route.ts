import { NextResponse, type NextRequest } from "next/server"

import { safeRedirect } from "@workspace/core/redirect"
import {
  createAuthorizationRequest,
  serializeOAuthCookies,
} from "@workspace/oidc"

import { serializeReturnTo } from "@/lib/auth/return-to"
import { oidcConfig } from "@/lib/oidc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Start the authorization-code + PKCE flow.
 *
 * The user lands here from `/{locale}/sign-in` or from a deep link that needs a
 * session. `returnTo` is a same-site path; the OAuth state, verifier and nonce
 * are short-lived HttpOnly cookies set by `@workspace/oidc`.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const returnTo = safeRedirect(url.searchParams.get("returnTo"), "/")
  const authorization = createAuthorizationRequest(oidcConfig)

  const response = NextResponse.redirect(authorization.url)
  for (const cookie of serializeOAuthCookies(oidcConfig, {
    state: authorization.state,
    verifier: authorization.codeVerifier,
    nonce: authorization.nonce,
  })) {
    response.headers.append("Set-Cookie", cookie)
  }
  response.headers.append("Set-Cookie", serializeReturnTo(returnTo))
  response.headers.append("Cache-Control", "no-store")
  return response
}
