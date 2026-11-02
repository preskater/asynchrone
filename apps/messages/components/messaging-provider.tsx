"use client"

import * as messagingActions from "@/actions/messaging"
import { MessagingProvider } from "@workspace/messaging/store"
import type { MessagingData, MessagingMember } from "@workspace/messaging/types"

import { messagingLive } from "@/lib/messaging-live"

/**
 * The messages app's binding of the messaging provider: it supplies the server
 * actions (mutations), the polling reads (route handlers) and the organization
 * directory the conversation screens render.
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
      live={messagingLive}
      initialData={initialData}
      currentUserId={currentUserId}
      organizationId={organizationId}
      members={members}
    >
      {children}
    </MessagingProvider>
  )
}
