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
  context: { params: Promise<{ attachmentId: string }> }
): Promise<Response> {
  await requireAppService(request, SERVICE_SCOPES.exportRead)
  const { attachmentId } = await context.params
  const organizationId = new URL(request.url).searchParams.get("organizationId")
  if (!organizationId) {
    return Response.json(
      { error: { code: "validation_error", message: "organizationId is required" } },
      { status: 400 }
    )
  }
  const attachment = await prisma.messageAttachment.findFirst({
    where: {
      id: attachmentId,
      message: { conversation: { organizationId } },
    },
    select: { oid: true, sizeBytes: true },
  })
  if (!attachment || attachment.oid === null) throw new NotFoundError("Attachment")
  const { stream } = await largeObjectStore.open(Number(attachment.oid))
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Cache-Control": "no-store",
  }
  if (attachment.sizeBytes !== null) {
    headers["Content-Length"] = String(attachment.sizeBytes)
  }
  return new Response(Readable.toWeb(stream) as ReadableStream, { headers })
}
