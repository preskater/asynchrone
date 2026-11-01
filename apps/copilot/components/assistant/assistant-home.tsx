"use client"

import type { AssistantConversationSummary } from "@workspace/ai/conversations"
import { AssistantProvider } from "@workspace/ai/use-assistant"

import { AssistantWorkspace } from "@/components/assistant/assistant-workspace"

/**
 * Client boundary for the organization home.
 *
 * The server page loads the conversation list and passes it in, so the rail is
 * rendered on the first paint. The provider is keyed by organization: switching
 * organizations resets the transcript instead of mixing two histories.
 */
export function AssistantHome({
  organizationId,
  initialConversations,
}: {
  organizationId: string
  initialConversations: AssistantConversationSummary[]
}) {
  return (
    <AssistantProvider
      key={organizationId}
      organizationId={organizationId}
      initialConversations={initialConversations}
    >
      <AssistantWorkspace />
    </AssistantProvider>
  )
}
