import type { SearchQuery, SearchResult } from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"

import { messagingService } from "@/lib/messaging"

function context(input: SearchQuery): RequestContext {
  return {
    userId: input.userId ?? "system",
    userName: input.userName ?? "",
    userEmail: input.userEmail ?? "system@asynchrone.space",
    organizationId: input.organizationId,
    role: input.role ?? "member",
  }
}

export async function search(input: SearchQuery): Promise<SearchResult[]> {
  const ctx = context(input)
  const needle = input.query.toLocaleLowerCase()
  const base = `/${input.locale ?? "en"}/${input.organizationSlug ?? ""}/messages`
  const data = await messagingService.list(ctx)
  const visible = new Set(
    data.conversations
      .filter((conversation) => conversation.memberIds.includes(ctx.userId))
      .map((conversation) => conversation.id)
  )
  return [
    ...data.conversations
      .filter(
        (conversation) =>
          visible.has(conversation.id) &&
          conversation.name.toLocaleLowerCase().includes(needle)
      )
      .map((conversation) => ({
        app: "messages",
        type: "conversation",
        id: conversation.id,
        title: conversation.name,
        url: `${base}?conversation=${conversation.id}`,
      })),
    ...data.messages
      .filter(
        (message) =>
          visible.has(message.conversationId) &&
          message.body.toLocaleLowerCase().includes(needle)
      )
      .map((message) => ({
        app: "messages",
        type: "message",
        id: message.id,
        title: message.body.slice(0, 140),
        url: `${base}?conversation=${message.conversationId}&message=${message.id}`,
      })),
  ]
}
