"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { ChatPanel } from "@/components/messaging/chat-panel"
import { ConversationDetailsSheet } from "@/components/messaging/conversation-details-sheet"
import { SearchCommand } from "@/components/messaging/search-command"
import { ThreadSheet } from "@/components/messaging/thread-sheet"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { MessageSquareIcon } from "lucide-react"

import { useEnumLabel } from "@workspace/i18n/labels"
import { useMessaging } from "@/lib/messaging/store"
import { useRecents } from "@workspace/app-shell/recents"
import { useWorkspaceNav } from "@/lib/workspace-nav/store"

export function MessagingWorkspace() {
  const t = useTranslations("Messaging")
  const L = useEnumLabel()
  const {
    conversations,
    getConversation,
    getMember,
    dmPartner,
    markRead,
    ensureMessages,
  } = useMessaging()
  const { record, active, hydrated } = useRecents()
  const {
    messagesActiveId: activeId,
    selectConversation,
    messagesSearchOpen: searchOpen,
    setMessagesSearchOpen: setSearchOpen,
  } = useWorkspaceNav()
  const [threadId, setThreadId] = React.useState<string | undefined>()
  const [threadOpen, setThreadOpen] = React.useState(false)
  const [detailsOpen, setDetailsOpen] = React.useState(false)

  const activeConversation = getConversation(activeId)

  React.useEffect(() => {
    if (activeId) ensureMessages(activeId)
  }, [activeId, ensureMessages])

  const markedReadRef = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    if (!activeId || markedReadRef.current === activeId) return
    if (!getConversation(activeId)) return
    markedReadRef.current = activeId
    markRead(activeId)
  }, [activeId, getConversation, markRead])

  const restoredRef = React.useRef(false)
  React.useEffect(() => {
    if (!hydrated || restoredRef.current) return
    restoredRef.current = true
    if (active.messages) {
      selectConversation(active.messages)
    } else if (!activeId && conversations[0]) {
      selectConversation(conversations[0].id)
    }
  }, [hydrated, active.messages, activeId, conversations, selectConversation])

  React.useEffect(() => {
    if (!hydrated || !activeId) return
    const conversation = getConversation(activeId)
    if (!conversation) return
    record("messages", {
      id: conversation.id,
      label:
        conversation.kind === "channel"
          ? `#${conversation.name}`
          : (getMember(dmPartner(conversation))?.name ?? t("directMessage")),
      hint: dmPartner(conversation)
        ? L.conversationKind("dm")
        : L.conversationKind("channel"),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, hydrated])

  function openThread(messageId: string) {
    setThreadId(messageId)
    setThreadOpen(true)
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {activeConversation ? (
          <ChatPanel
            conversation={activeConversation}
            onOpenDetails={() => setDetailsOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            onReply={openThread}
          />
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareIcon />
              </EmptyMedia>
              <EmptyTitle>{t("noConversationSelected")}</EmptyTitle>
              <EmptyDescription>
                {t("noConversationSelectedDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <ThreadSheet
        messageId={threadId}
        open={threadOpen}
        onOpenChange={setThreadOpen}
      />

      {activeConversation && activeConversation.kind === "channel" ? (
        <ConversationDetailsSheet
          conversation={activeConversation}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />
      ) : null}

      <SearchCommand
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectConversation={selectConversation}
      />
    </>
  )
}
