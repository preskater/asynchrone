"use client"

import * as React from "react"

import type { MessagingNavigation } from "@workspace/messaging/components/navigation"

/**
 * The messages app's route state.
 *
 * Copilot kept this in its workspace shell because the conversation sidebar
 * and the chat shared one shell; on the messages host the whole app is the
 * conversation screen, so the selected conversation and the search palette
 * live here. The messaging store restores the last conversation from the
 * shared recents entry after hydration.
 */
const MessagesNavigationContext =
  React.createContext<MessagingNavigation | null>(null)

export function MessagesNavigationProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [activeId, setActiveId] = React.useState<string | undefined>()
  const [searchOpen, setSearchOpen] = React.useState(false)

  const navigation = React.useMemo<MessagingNavigation>(
    () => ({
      activeId,
      selectConversation: setActiveId,
      searchOpen,
      setSearchOpen,
    }),
    [activeId, searchOpen]
  )

  return (
    <MessagesNavigationContext.Provider value={navigation}>
      {children}
    </MessagesNavigationContext.Provider>
  )
}

export function useMessagesNavigation(): MessagingNavigation {
  const context = React.useContext(MessagesNavigationContext)
  if (!context) {
    throw new Error(
      "useMessagesNavigation must be used within a MessagesNavigationProvider"
    )
  }
  return context
}
