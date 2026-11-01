import { NextResponse, type NextRequest } from "next/server"

import { handleBackChannelLogout } from "@workspace/oidc"

import { oidcConfig, sessionStore } from "@/lib/oidc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * OIDC back-channel logout: Copilot posts a signed logout token and every
 * local session with that `sid` is deleted. Registered as
 * `backchannelLogoutUri` on the provisioned client.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const logoutToken = form ? String(form.get("logout_token") ?? "") : ""
  if (!logoutToken) {
    return new NextResponse(null, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    })
  }

  try {
    await handleBackChannelLogout(oidcConfig, sessionStore, logoutToken)
  } catch (cause) {
    console.error("[clients] back-channel logout rejected", cause)
    return new NextResponse(null, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    })
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  })
}
