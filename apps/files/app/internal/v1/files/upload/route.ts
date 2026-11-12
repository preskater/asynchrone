import { Readable } from "node:stream"

import { z } from "zod"

import { SERVICE_SCOPES } from "@workspace/contracts"
import { parseRoles } from "@workspace/core/roles"

import { fileService } from "@/lib/files"
import { largeObjectStore } from "@/lib/large-object"
import { requireAppService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const query = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1).max(200),
  mimeType: z.string().max(200).optional(),
  sizeBytes: z.coerce.number().int().nonnegative(),
})

/**
 * Stream a portal upload into the workspace file tree.
 *
 * The portal keeps its routes in Copilot; the bytes still land in the files
 * database, so Copilot proxies the request instead of writing another app's
 * large objects.
 */
export async function POST(request: Request): Promise<Response> {
  await requireAppService(request, SERVICE_SCOPES.domainWrite)
  const url = new URL(request.url)
  const input = query.parse({
    organizationId: url.searchParams.get("organizationId"),
    name: url.searchParams.get("name"),
    mimeType: url.searchParams.get("mimeType") ?? undefined,
    sizeBytes: url.searchParams.get("sizeBytes"),
  })
  if (!request.body) {
    return Response.json(
      { error: { code: "validation_error", message: "A body is required" } },
      { status: 400 }
    )
  }
  const uploaded = await largeObjectStore.upload(
    Readable.fromWeb(request.body as import("node:stream/web").ReadableStream)
  )
  const ctx = {
    userId: request.headers.get("x-user-id") ?? "system",
    userName: request.headers.get("x-user-name") ?? "",
    userEmail: request.headers.get("x-user-email") ?? "system@asynchrone.space",
    organizationId: input.organizationId,
    roles: parseRoles(
      request.headers.get("x-user-roles") ??
        request.headers.get("x-user-role") ??
        "client"
    ),
  }
  const file = await fileService.createUploadedFile(ctx, {
    name: input.name,
    parentId: null,
    sizeBytes: uploaded.size,
    mimeType: input.mimeType,
    oid: uploaded.oid,
    sha256: uploaded.sha256,
  })
  return Response.json({
    data: { id: file.id },
    meta: { app: "files", version: "v1", requestId: crypto.randomUUID() },
  })
}
