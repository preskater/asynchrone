import { NextResponse } from "next/server"

import { isAppError } from "@workspace/core/errors"
import { jsonError, rejectCrossOrigin } from "@workspace/core/http"

import {
  createConversation,
  listConversations,
} from "@/lib/assistant/conversations"
import { assistantRequestContext } from "@/lib/assistant/context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The signed-in user's conversations in the active organization.
 *
 * The home page loads this list on the server; the provider refreshes it after
 * a turn so the derived title and the ordering catch up. Every row is scoped
 * to both `organizationId` and `userId` in `listConversations`.
 */
export async function GET(request: Request) {
  try {
    const ctx = await assistantRequestContext(request)
    return NextResponse.json(
      { conversations: await listConversations(ctx) },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (isAppError(error)) return jsonError(error)
    throw error
  }
}

/**
 * Starts an empty conversation. It is persisted immediately so "New chat" has
 * a stable id that survives a reload; the first user message derives the
 * title. No body is read, so nothing from the client reaches the store.
 */
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request)
  if (blocked) return blocked

  try {
    const ctx = await assistantRequestContext(request)
    const conversation = await createConversation(ctx)
    return NextResponse.json(
      { conversation },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (isAppError(error)) return jsonError(error)
    throw error
  }
}
