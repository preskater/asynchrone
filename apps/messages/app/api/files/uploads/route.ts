import { NextResponse } from "next/server"

import { toAppError } from "@workspace/core/errors"
import { jsonError, rejectCrossOrigin } from "@workspace/core/http"
import { filesRuntime } from "@/lib/files"
import { getRequestContext } from "@/lib/request-context"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_NAME = 200

export async function POST(request: Request): Promise<NextResponse> {
  const blocked = rejectCrossOrigin(request)
  if (blocked) return blocked
  try {
    const ctx = await getRequestContext()
    const url = new URL(request.url)
    const name = url.searchParams.get("name")
    const parentId = url.searchParams.get("parentId")
    const mimeType = url.searchParams.get("mimeType") || undefined
    const expectedSizeParam = url.searchParams.get("expectedSize")
    const transient = url.searchParams.get("transient") === "1"

    // This host only serves message attachments: the composer uploads through
    // the files domain's transient sessions, which return the large-object
    // reference the message row persists. Workspace files belong to the files
    // app, so refuse to create file nodes here.
    if (!transient) {
      return NextResponse.json(
        {
          error: {
            code: "bad_request",
            message: "Only transient message attachments can be uploaded here.",
          },
        },
        { status: 400 }
      )
    }

    if (!name || name.length > MAX_NAME) {
      return NextResponse.json(
        {
          error: {
            code: "bad_request",
            message: "A valid file name is required.",
          },
        },
        { status: 400 }
      )
    }

    const expectedSize = expectedSizeParam
      ? Number(expectedSizeParam)
      : undefined
    if (
      expectedSize === undefined ||
      !Number.isInteger(expectedSize) ||
      expectedSize < 0
    ) {
      return NextResponse.json(
        {
          error: {
            code: "bad_request",
            message: "A non-negative expectedSize is required.",
          },
        },
        { status: 400 }
      )
    }

    const session = await filesRuntime.uploads.createUploadSession(ctx, {
      name,
      parentId: parentId || null,
      mimeType,
      expectedSize,
      transient,
    })
    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    return jsonError(toAppError(error))
  }
}

export function GET(): NextResponse {
  return new NextResponse("Method Not Allowed", { status: 405 })
}
