"use client"

import * as messagingActions from "@/actions/messaging"
import { MessagingProvider } from "@workspace/messaging/store"
import type { MessagingData } from "@workspace/messaging/types"

import { useProjectStore } from "@workspace/projects/store"

/**
 * Copilot's binding of the messaging provider: it supplies the server actions
 * and the organization directory the conversation screens render.
 */
export function MessagingShellProvider({
  children,
  initialData,
  currentUserId,
  organizationId,
}: {
  children: React.ReactNode
  initialData: MessagingData
  currentUserId: string
  organizationId: string
}) {
  const { members } = useProjectStore()

  return (
    <MessagingProvider
      actions={messagingActions}
      initialData={initialData}
      currentUserId={currentUserId}
      organizationId={organizationId}
      members={members}
    >
      {children}
    </MessagingProvider>
  )
}
