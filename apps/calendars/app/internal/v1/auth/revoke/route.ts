import { NextResponse } from "next/server"

import {
  SERVICE_SCOPES,
  SessionRevokeRequestSchema,
} from "@workspace/contracts"
import { ServiceAuthError } from "@workspace/service-auth"

import { requireAppService } from "@/lib/internal/service"
import { sessionStore } from "@/lib/oidc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function unauthorized(error: unknown): NextResponse {
  if (error instanceof ServiceAuthError) {
    return NextResponse.json(
      { error: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } }
    )
  }
  return NextResponse.json(
    { error: "invalid_token" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  )
}

/**
 * End every local session of a Copilot sign-in. Copilot calls this on
 * organization switch and stop-impersonation so a context change cannot leave
 * an app session bound to the previous organization or to the impersonated
 * user. The call is authenticated with a client-credentials token whose
 * audience is this app, so another app's token cannot revoke sessions here.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAppService(request, SERVICE_SCOPES.domainWrite)
  } catch (error) {
    return unauthorized(error)
  }

  const body = SessionRevokeRequestSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  await sessionStore.deleteBySid(body.data.sid)
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  })
}
