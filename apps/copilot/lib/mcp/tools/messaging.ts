import { z } from "zod"

import type { RequestContext } from "@workspace/core/context"
import { callDomain, delegatedContext } from "@/lib/internal/domain"
import {
  createChannelSchema,
  sendMessageSchema,
} from "@workspace/messaging/schemas"

import type { McpTool } from "./projects"

const result = z.unknown()

function call(
  ctx: RequestContext,
  operation:
    "list-conversations" | "list-messages" | "send-message" | "create-channel",
  input: unknown
) {
  return callDomain("messages", operation, delegatedContext(ctx), input, result)
}

export const messagingTools: McpTool[] = [
  {
    name: "list_conversations",
    title: "List conversations",
    description:
      "List the workspace conversations (channels and direct messages). Each conversation includes its latest message preview; use list_messages for history.",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => call(ctx, "list-conversations", {}),
  },
  {
    name: "list_messages",
    title: "List messages",
    description:
      "List one page of top-level messages in a conversation (newest page first, replies included). Pass the previous `cursor` to load older messages.",
    inputSchema: {
      conversationId: z.string(),
      cursor: z.string().optional(),
    },
    readOnly: true,
    run: (ctx, input) =>
      call(ctx, "list-messages", {
        conversationId: String(input.conversationId),
        cursor: input.cursor,
      }),
  },
  {
    name: "send_message",
    title: "Send message",
    description:
      "Send a message to a conversation. Supports attaching a meeting card via the meeting field.",
    inputSchema: sendMessageSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "send-message", sendMessageSchema.parse(input)),
  },
  {
    name: "create_channel",
    title: "Create channel",
    description: "Create a new channel inside a team.",
    inputSchema: createChannelSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "create-channel", createChannelSchema.parse(input)),
  },
]

export type { RequestContext }
