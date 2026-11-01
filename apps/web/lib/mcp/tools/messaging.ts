import { z } from "zod"

import type { RequestContext } from "@workspace/core/context"
import { messagingService } from "@/lib/messaging"
import {
  createChannelSchema,
  sendMessageSchema,
} from "@workspace/messaging/schemas"

import type { McpTool } from "./projects"

export const messagingTools: McpTool[] = [
  {
    name: "list_conversations",
    title: "List conversations",
    description:
      "List the workspace conversations (channels and direct messages). Each conversation includes its latest message preview; use list_messages for history.",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => messagingService.list(ctx),
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
    run: async (ctx, input) => {
      const page = await messagingService.listMessages(
        ctx,
        String(input.conversationId),
        { cursor: input.cursor as string | undefined }
      )
      return page.items
    },
  },
  {
    name: "send_message",
    title: "Send message",
    description:
      "Send a message to a conversation. Supports attaching a meeting card via the meeting field.",
    inputSchema: sendMessageSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      messagingService.sendMessage(ctx, sendMessageSchema.parse(input)),
  },
  {
    name: "create_channel",
    title: "Create channel",
    description: "Create a new channel inside a team.",
    inputSchema: createChannelSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      messagingService.createChannel(ctx, createChannelSchema.parse(input)),
  },
]

export type { RequestContext }
