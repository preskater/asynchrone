import { Readable } from "node:stream"

import { NextResponse } from "next/server"

import { toAppError } from "@workspace/core/errors"
import { jsonError, rejectCrossOrigin } from "@workspace/core/http"
import { MAX_PORTAL_UPLOAD_BYTES, portalService } from "@/lib/portal"
import { getPortalContext } from "@/lib/portal/context"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Direct upload of one document from the client portal. The file is stored in
 * the workspace files and linked to the client's company as a client-visible
 * document (visible to the team and the client).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const blocked = rejectCrossOrigin(request)
  if (blocked) return blocked
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Portal access required." } },
        { status: 403 }
      )
    }

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "A file is required." } },
        { status: 400 }
      )
    }

    if (file.size > MAX_PORTAL_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "file_too_large",
            message: "The file is too large.",
            params: { max: String(MAX_PORTAL_UPLOAD_BYTES / (1024 * 1024)) },
          },
        },
        { status: 422 }
      )
    }

    const stream = Readable.fromWeb(file.stream() as never)
    const document = await portalService.uploadDocument(ctx, {
      name: file.name,
      mimeType: file.type || undefined,
      sizeBytes: file.size,
      stream,
    })

    return NextResponse.json({ document }, { status: 201 })
  } catch (error) {
    return jsonError(toAppError(error))
  }
}
