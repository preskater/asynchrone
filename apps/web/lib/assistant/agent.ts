import "@workspace/ai/provider"

import { createAssistantAgent } from "@workspace/ai/agent"

import { assistantTools } from "@/lib/assistant/tools"

/**
 * Copilot's assistant agent. The tools call the domain services (and will call
 * their internal APIs once #190 lands); `@workspace/ai` only builds the agent.
 */
export const assistantAgent = createAssistantAgent({ tools: assistantTools })
