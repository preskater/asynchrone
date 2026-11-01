/**
 * Copilot's assistant building blocks.
 *
 * Chat parts, model pricing, suggestions and the quota ledger are shared; the
 * tools stay in the owning app because they call the domain internal APIs
 * (#190). Nothing here imports an app or opens a domain database.
 *
 * Provider configuration and the client hook live on subpaths so a server
 * import does not pull React, and a client import does not run the provider
 * side effect.
 */
export * from "./chat"
export * from "./model"
export * from "./pricing"
export * from "./suggestions"
export * from "./usage"
export { ASSISTANT_INSTRUCTIONS, createAssistantAgent } from "./agent"
export type { CreateAssistantAgentOptions } from "./agent"
