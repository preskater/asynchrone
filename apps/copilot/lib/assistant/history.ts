import type { AssistantPart, ChatMessage } from "@workspace/ai/chat"
import { isTextPart } from "@workspace/ai/chat"

/**
 * Pure helpers for the persisted assistant transcript.
 *
 * Kept apart from `conversations.ts` so they can be unit-tested without a
 * database connection.
 */

/** Turns replayed to the model; the oldest turns of a long chat fall away. */
export const MAX_HISTORY_MESSAGES = 40

/** Turns returned by the reload endpoint, so a long chat still renders. */
export const MAX_RECENT_MESSAGES = 200

/** A single user turn. Larger bodies are rejected before any model call. */
export const MAX_MESSAGE_CHARS = 20_000

const TITLE_MAX_CHARS = 80

export interface StoredMessage {
  id: string
  role: string
  parts: unknown
}

/** First line of the first user message, collapsed and clipped. */
export function titleFromText(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim()
  if (collapsed.length <= TITLE_MAX_CHARS) return collapsed
  return `${collapsed.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parsePart(value: unknown): AssistantPart | null {
  if (!isRecord(value)) return null
  switch (value.type) {
    case "text":
      return typeof value.text === "string"
        ? { type: "text", text: value.text }
        : null
    case "reasoning":
      return typeof value.text === "string"
        ? {
            type: "reasoning",
            text: value.text,
            state: value.state === "streaming" ? "streaming" : "done",
          }
        : null
    case "tool":
      if (
        typeof value.name !== "string" ||
        typeof value.callId !== "string" ||
        typeof value.args !== "string"
      ) {
        return null
      }
      return {
        type: "tool",
        name: value.name,
        callId: value.callId,
        args: value.args,
        state: value.state === "output" ? "output" : "call",
        ...(typeof value.output === "string" ? { output: value.output } : {}),
      }
    default:
      return null
  }
}

/** Defensive read of the persisted JSON, so one bad row cannot break a reload. */
export function parseParts(value: unknown): AssistantPart[] {
  if (!Array.isArray(value)) return []
  return value
    .map(parsePart)
    .filter((part): part is AssistantPart => part !== null)
}

/** Stored rows → the shape the client renders and `toAgentInput` replays. */
export function toChatMessages(rows: StoredMessage[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (const row of rows) {
    const parts = parseParts(row.parts)
    if (row.role === "user") {
      const text = parts
        .filter(isTextPart)
        .map((part) => part.text)
        .join("")
      if (!text) continue
      messages.push({
        id: row.id,
        role: "user",
        parts: [{ type: "text", text }],
      })
    } else if (row.role === "assistant" && parts.length > 0) {
      messages.push({ id: row.id, role: "assistant", parts })
    }
  }
  return messages
}
