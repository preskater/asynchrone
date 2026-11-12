import { z } from "zod"

import type {
  DelegatedContext,
  DomainCall,
  DomainOperation,
} from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { rolesFrom } from "@workspace/core/roles"
import { NotFoundError } from "@workspace/core/errors"
import {
  createChannelSchema,
  sendMessageSchema,
} from "@workspace/messaging/schemas"

import { messagingService } from "@/lib/messaging"

function requestContext(context: DelegatedContext): RequestContext {
  return {
    userId: context.userId,
    userName: context.userName,
    userEmail: context.userEmail,
    organizationId: context.organizationId,
    roles: rolesFrom(context),
  }
}

const messagesInput = z.object({
  conversationId: z.string().min(1),
  cursor: z.string().optional(),
})

export async function dispatchDomain(
  operation: DomainOperation,
  call: DomainCall
): Promise<unknown> {
  const ctx = requestContext(call.context)

  switch (operation) {
    case "list-conversations":
      return messagingService.list(ctx)
    case "list-messages": {
      const input = messagesInput.parse(call.input)
      const page = await messagingService.listMessages(
        ctx,
        input.conversationId,
        { cursor: input.cursor }
      )
      return page.items
    }
    case "send-message":
      return messagingService.sendMessage(
        ctx,
        sendMessageSchema.parse(call.input)
      )
    case "create-channel":
      return messagingService.createChannel(
        ctx,
        createChannelSchema.parse(call.input)
      )
    default:
      throw new NotFoundError("Domain operation")
  }
}
