import { NextResponse } from "next/server"

import { getRequestContext } from "@/lib/request-context"
import { toAppError } from "@workspace/core/errors"
import { jsonError, rejectCrossOrigin } from "@workspace/core/http"
import { filesRuntime } from "@/lib/files"

export const runtime = "nodejs"
export const maxDuration = 60

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
): Promise<NextResponse> {
  const blocked = rejectCrossOrigin(request)
  if (blocked) return blocked
  try {
    const ctx = await getRequestContext()
    const { uploadId } = await params

    const offsetHeader = request.headers.get("x-chunk-offset")
    const offset = Number(offsetHeader)
    if (offsetHeader === null || !Number.isInteger(offset) || offset < 0) {
      return NextResponse.json(
        {
          error: {
            code: "bad_request",
            message: "Missing or invalid chunk offset.",
          },
        },
        { status: 400 }
      )
    }
    if (!request.body) {
      return NextResponse.json(
        {
          error: {
            code: "bad_request",
            message: "A request body is required.",
          },
        },
        { status: 400 }
      )
    }

    const chunk = Buffer.from(await request.arrayBuffer())
    const result = await filesRuntime.uploads.appendUploadChunk(
      ctx,
      uploadId,
      offset,
      chunk
    )
    return NextResponse.json(result)
  } catch (error) {
    return jsonError(toAppError(error))
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
): Promise<NextResponse> {
  try {
    const ctx = await getRequestContext()
    const { uploadId } = await params
    const session = await filesRuntime.uploads.getUploadSession(ctx, uploadId)
    return NextResponse.json(session)
  } catch (error) {
    return jsonError(toAppError(error))
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
): Promise<NextResponse> {
  const blocked = rejectCrossOrigin(request)
  if (blocked) return blocked
  try {
    const ctx = await getRequestContext()
    const { uploadId } = await params
    await filesRuntime.uploads.abortUploadSession(ctx, uploadId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return jsonError(toAppError(error))
  }
}
