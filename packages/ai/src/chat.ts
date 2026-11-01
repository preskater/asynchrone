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
