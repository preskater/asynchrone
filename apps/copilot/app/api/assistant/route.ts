import { run, type RunStreamEvent } from "@openai/agents"
import { NextResponse } from "next/server"
import { z } from "zod"

import { getRequestContext } from "@/lib/core/auth-context"
import {
  applyAssistantEvent,
  finishAssistantParts,
  toAgentInput,
  type AssistantPart,
  type AssistantStreamEvent,
  type ChatMessage,
} from "@workspace/ai/chat"
import { AppError, isAppError } from "@workspace/core/errors"
import { jsonError, rejectCrossOrigin } from "@workspace/core/http"
import { upgradeRequired } from "@/lib/organization/entitlements"
import { rateLimit } from "@/lib/core/rate-limit"
import { assistantAgent } from "@/lib/assistant/agent"
import {
  beginTurn,
  completeTurn,
  loadConversation,
  MAX_MESSAGE_CHARS,
  type AssistantTurn,
} from "@/lib/assistant/conversations"
import { DEFAULT_ASSISTANT_MODEL } from "@workspace/ai/model"
import { getAiQuota, quotaExceeded, recordAiUsage } from "@/lib/assistant/usage"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_TURNS = 8
const STREAM_ERROR_MESSAGE =
  "The assistant could not complete your request. Please try again."

/**
 * The client sends only the new turn. History is loaded from the database, so
 * a request cannot smuggle assistant text or tool results into the model
 * context. Unknown keys are rejected rather than silently ignored.
 */
const bodySchema = z
  .object({
    conversationId: z.string().min(1).max(64).optional(),
    text: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  })
  .strict()

function toOutputString(output: unknown): string {
  if (typeof output === "string") return output
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function toClientEvent(
  event: RunStreamEvent
): AssistantStreamEvent | undefined {
  if (event.type === "raw_model_stream_event") {
    if (event.data.type === "output_text_delta") {
      return { type: "text", delta: event.data.delta }
    }
    return undefined
  }

  if (event.type !== "run_item_stream_event") return undefined

  if (event.name === "tool_called") {
    const raw = event.item.rawItem
    if (raw.type !== "function_call") return undefined
    return {
      type: "tool_call",
      name: raw.name,
      callId: raw.callId,
      args: raw.arguments,
    }
  }

  if (event.name === "tool_output") {
    const item = event.item
    if (item.type !== "tool_call_output_item") return undefined
    const raw = item.rawItem
    if (!("name" in raw) || !("callId" in raw)) return undefined
    return {
      type: "tool_output",
      name: raw.name,
      callId: raw.callId,
      output: toOutputString(item.output),
    }
  }

  if (event.name === "reasoning_item_created") {
    const raw = event.item.rawItem
    if (raw.type !== "reasoning") return undefined
    const text = raw.content
      .map((part) => (part.type === "input_text" ? part.text : ""))
      .join("")
    if (!text) return undefined
    return { type: "reasoning", text }
  }

  return undefined
}

/** Reloads the signed-in user's conversation, scoped to the active org. */
export async function GET(request: Request) {
  try {
    const ctx = await getRequestContext({ request })
    const conversationId = new URL(request.url).searchParams.get(
      "conversationId"
    )
    if (!conversationId) {
      return new Response("Missing conversationId", { status: 422 })
    }

    const conversation = await loadConversation(ctx, conversationId)
    return NextResponse.json(conversation, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (isAppError(error)) return jsonError(error)
    throw error
  }
}

export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request)
  if (blocked) return blocked
  const ctx = await getRequestContext({ request })

  // A custom OpenAI-compatible endpoint (OPENAI_API_URL) may not need a key.
  if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_URL) {
    return jsonError(
      new AppError("assistant_unavailable", "OPENAI_API_KEY is not set.", {
        status: 503,
      })
    )
  }

  // Checked before the run so an organization over its allowance makes no model call.
  const quota = await getAiQuota(ctx.organizationId)
  if (quota.budgetMicros === 0) {
    return jsonError(upgradeRequired("aiBudgetMicrosPerSeat"))
  }
  if (quota.usedMicros >= quota.budgetMicros) {
    return jsonError(quotaExceeded(quota.resetAt))
  }

  // Fail closed: every allowed run spends model tokens.
  const limited = await rateLimit(`assistant:${ctx.userId}`, 20, 5 * 60_000, {
    failOpen: false,
  })
  if (!limited.allowed) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfter) },
    })
  }

  const raw = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return new Response("Invalid request", { status: 422 })
  }

  // Resolves the conversation (rejecting another user's id) and stores the
  // accepted user message before the model call.
  let turn: AssistantTurn
  try {
    turn = await beginTurn(ctx, parsed.data)
  } catch (error) {
    if (isAppError(error)) return jsonError(error)
    throw error
  }

  const userMessage: ChatMessage = {
    id: turn.conversationId,
    role: "user",
    parts: [{ type: "text", text: parsed.data.text }],
  }

  // Stop spending tokens as soon as the client goes away.
  const abort = new AbortController()
  request.signal.addEventListener("abort", () => abort.abort())

  // Same model the agent runs on, so the cost written to AiUsageEvent matches.
  const model = process.env.ASSISTANT_MODEL ?? DEFAULT_ASSISTANT_MODEL
  const stream = await run(
    assistantAgent,
    toAgentInput([...turn.history, userMessage]),
    {
      stream: true,
      context: ctx,
      maxTurns: MAX_TURNS,
      signal: abort.signal,
    }
  )

  const encoder = new TextEncoder()
  let parts: AssistantPart[] = []
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AssistantStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }
      try {
        for await (const event of stream) {
          const clientEvent = toClientEvent(event)
          if (!clientEvent) continue
          parts = applyAssistantEvent(parts, clientEvent)
          send(clientEvent)
        }
        await stream.completed

        // Only a completed stream is written: an aborted or failed run leaves
        // the accepted user message and no half-written answer.
        if (!abort.signal.aborted) {
          await completeTurn(
            ctx,
            turn.conversationId,
            finishAssistantParts(parts)
          )
        }
        send({ type: "done" })
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error("[assistant] stream error", error)
          send({ type: "error", message: STREAM_ERROR_MESSAGE })
        }
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed by the client disconnecting.
        }
        // Exactly one row per run, aborted runs included; written after the
        // response is closed so it adds nothing to the user's wait.
        // ponytail: tokens of a model call cut off mid-stream are not reported by the API, so aborts undercount slightly.
        await recordAiUsage(ctx, model, stream.state.usage).catch((error) =>
          console.error("[assistant] usage write failed", error)
        )
      }
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Assistant-Conversation-Id": turn.conversationId,
    },
  })
}
