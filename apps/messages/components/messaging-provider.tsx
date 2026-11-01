"use client"

import * as messagingActions from "@/actions/messaging"
import { MessagingProvider } from "@workspace/messaging/store"
import type { MessagingData, MessagingMember } from "@workspace/messaging/types"

/**
 * The messages app's binding of the messaging provider: it supplies the server
 * actions and the organization directory the conversation screens render.
 */
export function MessagingShellProvider({
  children,
  initialData,
  currentUserId,
  organizationId,
  members,
}: {
  children: React.ReactNode
  initialData: MessagingData
  currentUserId: string
  organizationId: string
  members: MessagingMember[]
}) {
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
