/**
 * Header the client sends with every assistant call so the request targets the
 * organization in the URL even while the shell's active organization is still
 * syncing after an organization switch. The server verifies membership; the
 * value is never trusted on its own.
 */
export const ASSISTANT_ORGANIZATION_HEADER = "X-Organization-Id"

/**
 * Conversation summaries shared by the server-rendered list and the client
 * store.
 *
 * The server serializes `updatedAt` before it crosses the wire, so the store
 * only ever compares ISO strings. Keeping the ordering helpers pure makes the
 * list deterministic without a database connection.
 */
export interface AssistantConversationSummary {
  id: string
  /** Derived from the first user message; empty until the first turn. */
  title: string
  /** ISO timestamp, newest first. */
  updatedAt: string
}

function timestamp(conversation: AssistantConversationSummary): number {
  const value = Date.parse(conversation.updatedAt)
  return Number.isNaN(value) ? 0 : value
}

/** Newest conversation first, with a stable tie-break on the id. */
export function sortConversations(
  conversations: AssistantConversationSummary[]
): AssistantConversationSummary[] {
  return [...conversations].sort(
    (left, right) =>
      timestamp(right) - timestamp(left) || right.id.localeCompare(left.id)
  )
}

/**
 * Inserts or replaces one conversation, keeping the newest-first order. A
 * conversation that the model just completed moves back to the top.
 */
export function upsertConversation(
  conversations: AssistantConversationSummary[],
  conversation: AssistantConversationSummary
): AssistantConversationSummary[] {
  return sortConversations([
    conversation,
    ...conversations.filter((entry) => entry.id !== conversation.id),
  ])
}

export function removeConversation(
  conversations: AssistantConversationSummary[],
  conversationId: string
): AssistantConversationSummary[] {
  return conversations.filter((entry) => entry.id !== conversationId)
}
