import { Readable } from "node:stream"

import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { isAppError } from "@workspace/core/errors"

import { auth } from "@/lib/auth"
import { getPortalContext, portalService } from "@/lib/portal"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Download of a client-visible document for portal users. The package owns the
 * access rule: a member row linked to a company and a ClientDocument
 * (visibility=client) link on that company. The large object is opened through
 * Copilot's storage binding.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const { fileId } = await params
  const ctx = await getPortalContext()
  if (!ctx) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  let file
  try {
    file = await portalService.openDocument(ctx, fileId)
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") {
      return new NextResponse("Not found", { status: 404 })
    }
    throw error
  }

  const body = Readable.toWeb(file.stream) as unknown as ReadableStream
  return new NextResponse(body, {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Length": String(file.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      "Cache-Control": "private, no-cache",
    },
  })
}
