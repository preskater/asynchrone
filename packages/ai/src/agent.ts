import { Agent, type Tool } from "@openai/agents"

import type { RequestContext } from "@workspace/core/context"

import { DEFAULT_ASSISTANT_MODEL } from "./model"

export const ASSISTANT_INSTRUCTIONS = `You are the Asynchrone Space assistant, embedded in an AI-native productivity workspace.
You can read and modify the user's projects, tasks, calendars, files and messages through tools.
Prefer calling a read tool before making changes. Keep replies concise and action-oriented.
When you create or change something, confirm briefly what you did.
Always finish with a short, self-contained text answer that summarizes the result for the user.`

export interface CreateAssistantAgentOptions {
  tools: Tool<RequestContext>[]
  instructions?: string
  model?: string
}

/**
 * Builds the assistant agent around the tools the owning app supplies.
 *
 * The tools themselves stay with the app: they call the domain internal APIs
 * (see #190), so the AI package never imports a domain database.
 */
export function createAssistantAgent({
  tools,
  instructions = ASSISTANT_INSTRUCTIONS,
  model = process.env.ASSISTANT_MODEL ?? DEFAULT_ASSISTANT_MODEL,
}: CreateAssistantAgentOptions) {
  return new Agent<RequestContext>({
    name: "Asynchrone Space Assistant",
    instructions,
    tools,
    model,
  })
}
