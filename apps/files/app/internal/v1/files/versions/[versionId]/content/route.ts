import { Readable } from "node:stream"

import { SERVICE_SCOPES } from "@workspace/contracts"
import { NotFoundError } from "@workspace/core/errors"

import { largeObjectStore } from "@/lib/large-object"
import { prisma } from "@/lib/prisma"
import { requireAppService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  context: { params: Promise<{ versionId: string }> }
): Promise<Response> {
  await requireAppService(request, SERVICE_SCOPES.exportRead)
  const { versionId } = await context.params
  const organizationId = new URL(request.url).searchParams.get("organizationId")
  if (!organizationId) {
    return Response.json(
      { error: { code: "validation_error", message: "organizationId is required" } },
      { status: 400 }
    )
  }
  const version = await prisma.fileVersion.findFirst({
    where: { id: versionId, file: { organizationId } },
    select: { oid: true, sizeBytes: true },
  })
  if (!version || version.oid === null) throw new NotFoundError("File version")
  const { stream } = await largeObjectStore.open(Number(version.oid))
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Cache-Control": "no-store",
  }
  if (version.sizeBytes !== null) {
    headers["Content-Length"] = String(version.sizeBytes)
  }
  return new Response(Readable.toWeb(stream) as ReadableStream, { headers })
}
