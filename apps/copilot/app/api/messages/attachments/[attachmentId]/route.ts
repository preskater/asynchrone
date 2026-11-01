import { Readable } from "node:stream"

import { NextResponse } from "next/server"

import { getRequestContext } from "@/lib/core/auth-context"
import { messagingService } from "@/lib/messaging"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const ctx = await getRequestContext({ request })
  const { attachmentId } = await params

  // The lookup is organization-scoped: an attachment id from another
  // organization is indistinguishable from a missing one.
  const attachment = await messagingService.openAttachment(ctx, attachmentId)
  if (!attachment) {
    return new NextResponse("Not found", { status: 404 })
  }

  const body = Readable.toWeb(attachment.stream) as unknown as ReadableStream
  return new NextResponse(body, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.name)}"`,
      "Cache-Control": "private, no-cache",
    },
  })
}
