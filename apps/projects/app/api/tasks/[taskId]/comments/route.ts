import { NextResponse } from "next/server"

import { toAppError } from "@workspace/core/errors"
import { jsonError } from "@workspace/core/http"

import { listTaskComments } from "@/lib/projects/task-comments"
import { getRequestContext } from "@/lib/request-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * One task's comments, re-read after a real-time hint (#98). A route handler
 * rather than a server action so it never touches the router (#171). The
 * lookup is scoped to the session's organization, so another organization's
 * task id returns an empty list.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const ctx = await getRequestContext()
    const { taskId } = await params
    return NextResponse.json(
      await listTaskComments(ctx.organizationId, taskId),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return jsonError(toAppError(error))
  }
}
