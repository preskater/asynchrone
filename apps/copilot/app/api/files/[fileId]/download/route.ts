import { Readable } from "node:stream"

import { NextResponse } from "next/server"

import { getRequestContext } from "@/lib/core/auth-context"
import { fileService } from "@/lib/files"
import { openLargeObjectStream } from "@/lib/large-object"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  let ctx
  try {
    ctx = await getRequestContext({ request })
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
  const { fileId } = await params

  try {
    await fileService.get(ctx, fileId)
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }

  const file = await prisma.fileNode.findFirst({
    where: { id: fileId, organizationId: ctx.organizationId },
    select: { name: true, oid: true, mimeType: true },
  })

  if (!file || file.oid === null) {
    return new NextResponse("Not found", { status: 404 })
  }

  const { size, stream } = await openLargeObjectStream(Number(file.oid))

  const body = Readable.toWeb(stream) as unknown as ReadableStream
  return new NextResponse(body, {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Length": String(size),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      "Cache-Control": "private, no-cache",
    },
  })
}
