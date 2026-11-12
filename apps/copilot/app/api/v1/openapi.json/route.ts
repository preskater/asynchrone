import { NextResponse } from "next/server"

import { buildOpenApiDocument } from "@/lib/api/openapi"

export const runtime = "nodejs"

/** Public contract of `/api/v1`; it holds no data, so it needs no token. */
export function GET(request: Request) {
  return NextResponse.json(buildOpenApiDocument(new URL(request.url).origin), {
    headers: { "Cache-Control": "public, max-age=300" },
  })
}
