import { NextResponse, type NextRequest } from "next/server"

import {
  clearOAuthCookies,
  completeAuthorization,
  readOAuthCookies,
} from "@workspace/oidc"

import { clearReturnTo, readReturnTo } from "@/lib/auth/return-to"
import { env } from "@/lib/env"
import { oidcConfig, sessionStore } from "@/lib/oidc"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function fail(reason: string): NextResponse {
  console.error("[files] OIDC callback failed", { reason })
  return new NextResponse("Sign-in failed. Please try again.", {
    status: 400,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}

/**
 * Finish the authorization-code + PKCE flow.
 *
 * `completeAuthorization` validates the state, exchanges the code, verifies the
 * access token against Copilot's JWKS, requires the `sid` and organization
 * claims and stores the local session. The package returns the cookies to
 * append; this route never builds one by hand.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const error = url.searchParams.get("error")
  if (error) return fail(error)

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookieHeader = request.headers.get("cookie")
  const cookies = readOAuthCookies(oidcConfig, cookieHeader)

  if (!code || !state || !cookies.state || !cookies.verifier) {
    return fail("missing_code_or_cookies")
  }

  let completed
  try {
    completed = await completeAuthorization(oidcConfig, sessionStore, {
      code,
      state,
      expectedState: cookies.state,
      codeVerifier: cookies.verifier,
    })
  } catch (cause) {
    console.error("[files] token exchange failed", cause)
    const response = fail("token_exchange")
    for (const cookie of clearOAuthCookies(oidcConfig)) {
      response.headers.append("Set-Cookie", cookie)
    }
    return response
  }

  // One local session per Copilot sign-in: switching organization re-authorizes
  // and must not leave a session bound to the previous organization behind.
  await prisma.oidcSession.deleteMany({
    where: { sid: completed.session.sid, id: { not: completed.session.id } },
  })

  const returnTo = readReturnTo(cookieHeader)
  const response = NextResponse.redirect(new URL(returnTo, env.FILES_APP_URL))
  for (const cookie of completed.setCookies) {
    response.headers.append("Set-Cookie", cookie)
  }
  response.headers.append("Set-Cookie", clearReturnTo())
  response.headers.append("Cache-Control", "no-store")
  return response
}
