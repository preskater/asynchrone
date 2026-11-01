import type { AgentInputItem } from "@openai/agents"

export type TextPart = {
  type: "text"
  text: string
}

export type ReasoningPart = {
  type: "reasoning"
  text: string
  state: "streaming" | "done"
}

export type ToolPart = {
  type: "tool"
  name: string
  callId: string
  args: string
  state: "call" | "output"
  output?: string
}

export type AssistantPart = TextPart | ReasoningPart | ToolPart

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  parts: AssistantPart[]
}

export function isTextPart(part: AssistantPart): part is TextPart {
  return part.type === "text"
}

export function isReasoningPart(part: AssistantPart): part is ReasoningPart {
  return part.type === "reasoning"
}

export function isToolPart(part: AssistantPart): part is ToolPart {
  return part.type === "tool"
}

export function getToolName(part: ToolPart): string {
  return part.name
}

/**
 * Events the assistant route streams back as NDJSON.
 *
 * The route applies {@link applyAssistantEvent} while it streams, so the parts
 * it persists are exactly the parts the client rendered; the client applies the
 * same reducer to its optimistic message. Keeping the protocol here makes the
 * two sides impossible to drift apart.
 */
export type AssistantStreamEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; name: string; callId: string; args: string }
  | { type: "tool_output"; name: string; callId: string; output: string }
  | { type: "error"; message: string }
  | { type: "done" }

/** Applies one streamed event to an assistant message's parts. */
export function applyAssistantEvent(
  parts: AssistantPart[],
  event: AssistantStreamEvent
): AssistantPart[] {
  switch (event.type) {
    case "text": {
      const delta = event.delta
      if (!delta) return parts
      const last = parts[parts.length - 1]
      if (last && last.type === "text") {
        return [...parts.slice(0, -1), { ...last, text: last.text + delta }]
      }
      return [...parts, { type: "text", text: delta }]
    }

    case "reasoning": {
      const text = event.text
      if (!text) return parts
      const last = parts[parts.length - 1]
      if (last && last.type === "reasoning" && last.state === "streaming") {
        return [...parts.slice(0, -1), { ...last, text: last.text + text }]
      }
      return [...parts, { type: "reasoning", text, state: "streaming" }]
    }

    case "tool_call":
      return [
        ...parts,
        {
          type: "tool",
          name: event.name,
          callId: event.callId,
          args: event.args,
          state: "call",
        },
      ]

    case "tool_output":
      return parts.map((part) =>
        part.type === "tool" && part.callId === event.callId
          ? { ...part, state: "output", output: event.output }
          : part
      )

    case "error":
    case "done":
      return parts
  }
}

/** Marks the reasoning a finished stream left `streaming` as done. */
export function finishAssistantParts(parts: AssistantPart[]): AssistantPart[] {
  return parts.map((part) =>
    part.type === "reasoning" && part.state === "streaming"
      ? { ...part, state: "done" }
      : part
  )
}

/**
 * Maps the client conversation into Agents SDK input items. Text turns map to
 * user/assistant messages; tool parts are replayed as function_call +
 * function_call_result pairs so multi-turn tool context is preserved.
 */
export function toAgentInput(messages: ChatMessage[]): AgentInputItem[] {
  const items: AgentInputItem[] = []

  for (const message of messages) {
    if (message.role === "user") {
      const text = message.parts
        .filter(isTextPart)
        .map((part) => part.text)
        .join("")
      if (text) items.push({ role: "user", content: text })
      continue
    }

    for (const part of message.parts) {
      if (isTextPart(part)) {
        if (!part.text) continue
        items.push({
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: part.text }],
        })
      } else if (isToolPart(part)) {
        items.push({
          type: "function_call",
          callId: part.callId,
          name: part.name,
          arguments: part.args,
        })
        if (part.state === "output" && part.output !== undefined) {
          items.push({
            type: "function_call_result",
            callId: part.callId,
            name: part.name,
            status: "completed",
            output: part.output,
          })
        }
      }
    }
  }

  return items
}
