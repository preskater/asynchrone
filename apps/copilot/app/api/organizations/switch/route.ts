import { NextResponse, type NextRequest } from "next/server"

import { trustedCustomerOrigins } from "@workspace/contracts/server"

import { auth } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Organization switch for the domain apps.
 *
 * Copilot owns the session cookie and the active organization, while a domain
 * app's access token is bound to the organization it was issued for. The app's
 * switcher links here with a `redirectTo` on its own origin; this route updates
 * the active organization and sends the browser back into the app's sign-in
 * flow, which mints a token for the new organization.
 *
 * Only registered customer origins may be redirected to, and only into their
 * sign-in route, so this cannot become an open redirect.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const organizationId = form ? String(form.get("organizationId") ?? "") : ""
  const redirectTo = form ? String(form.get("redirectTo") ?? "") : ""

  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url), 303)
  }

  if (!organizationId || !isAllowedReturnUrl(redirectTo)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  try {
    await auth.api.setActiveOrganization({
      headers: request.headers,
      body: { organizationId },
    })
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  return NextResponse.redirect(redirectTo, 303)
}

function isAllowedReturnUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (!trustedCustomerOrigins().includes(url.origin)) return false
  return url.pathname === "/api/auth/sign-in"
}
