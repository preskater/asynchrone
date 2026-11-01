import { NextResponse } from "next/server"

import { repositoryWebhookHandler } from "@/lib/integrations"

export const runtime = "nodejs"

/**
 * Receives GitHub/GitLab webhooks for a repository connection. The provider's
 * setup instructs the admin to paste this URL together with the connection's
 * webhook secret. Both providers post JSON here; the connection id in the URL
 * selects the secret used to verify the signature.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
): Promise<NextResponse> {
  const { connectionId } = await params
  const rawBody = await request.text()
  const result = await repositoryWebhookHandler.handle({
    connectionId,
    headers: request.headers,
    rawBody,
  })
  return NextResponse.json(result.body, { status: result.status })
}
