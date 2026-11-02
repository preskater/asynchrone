import { Readable } from "node:stream"

import { SERVICE_SCOPES } from "@workspace/contracts"
import { NotFoundError } from "@workspace/core/errors"

import { largeObjectStore } from "@/lib/large-object"
import { prisma } from "@/lib/prisma"
import { requireAppService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Stream one file's bytes to the export saga (authorization already applied). */
export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> }
): Promise<Response> {
  await requireAppService(request, SERVICE_SCOPES.exportRead)
  const { fileId } = await context.params
  const organizationId = new URL(request.url).searchParams.get("organizationId")
  if (!organizationId) {
    return Response.json(
      { error: { code: "validation_error", message: "organizationId is required" } },
      { status: 400 }
    )
  }
  const file = await prisma.fileNode.findFirst({
    where: { id: fileId, organizationId },
    select: { oid: true, sizeBytes: true },
  })
  if (!file || file.oid === null) throw new NotFoundError("File")
  const { stream } = await largeObjectStore.open(Number(file.oid))
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Cache-Control": "no-store",
  }
  if (file.sizeBytes !== null) {
    headers["Content-Length"] = String(file.sizeBytes)
  }
  return new Response(Readable.toWeb(stream) as ReadableStream, { headers })
}
