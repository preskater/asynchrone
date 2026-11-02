import type { Page } from "@workspace/core/pagination"
import type { MessagingLive } from "@workspace/messaging/store"
import type { Message, MessagingData } from "@workspace/messaging/types"

/**
 * The read side of the messaging screens, served by route handlers.
 *
 * Polling must not go through a server action: an action response applies an
 * RSC payload through the client router, which re-renders the route and can
 * abort an in-flight navigation — an organization switch races with the 5s
 * poll and never reaches Copilot. A plain `fetch` only returns data (#171).
 *
 * These run in the browser, so the session cookie is sent with every call and
 * the handlers resolve the organization from it, never from the request.
 */
async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  if (!response.ok) {
    throw new Error(`Messaging read failed with ${response.status}`)
  }
  return (await response.json()) as T
}

export const messagingLive: MessagingLive = {
  poll: () => getJson<MessagingData>("/api/messages/snapshot"),
  pollMessages: (conversationId, cursor) => {
    const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
    return getJson<Page<Message>>(
      `/api/messages/conversations/${encodeURIComponent(conversationId)}${search}`
    )
  },
  async touchPresence() {
    // Presence is advisory: a failure must not surface anywhere.
    await fetch("/api/messages/presence", {
      method: "POST",
      cache: "no-store",
    }).catch(() => undefined)
  },
}
