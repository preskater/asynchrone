import { Readable } from "node:stream"

import { NextResponse } from "next/server"

import { getRequestContext } from "@/lib/core/auth-context"
import { openLargeObjectStream } from "@/lib/large-object"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 300

/** Streams a ready export to an owner of its organization until it expires. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ exportId: string }> }
) {
  let ctx
  try {
    ctx = await getRequestContext({ request })
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
  if (ctx.role !== "owner") {
    return new NextResponse("Not found", { status: 404 })
  }
  const { exportId } = await params

  const job = await prisma.dataExport.findFirst({
    where: {
      id: exportId,
      organizationId: ctx.organizationId,
      status: "ready",
      expiresAt: { gt: new Date() },
    },
    select: { oid: true, completedAt: true },
  })
  if (!job || job.oid === null) {
    return new NextResponse("Not found", { status: 404 })
  }

  const { size, stream } = await openLargeObjectStream(Number(job.oid))
  const date = (job.completedAt ?? new Date()).toISOString().slice(0, 10)

  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(size),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="export-${date}.zip"`,
      "Cache-Control": "private, no-store",
    },
  })
}
