"use client"

import * as React from "react"

import type { MessagingMember } from "../types"
import { ChatHeader } from "./chat-header"
import { MessageComposer } from "./message-composer"
import { MessageList } from "./message-list"
import { useMessaging } from "../store"
import type { Conversation } from "../types"

/**
 * The app-local pieces of a chat panel.
 *
 * Calls and meeting cards live in `@workspace/meetings` (rendered by Copilot
 * today), so the package takes them as slots instead of importing an app.
 */
export interface ChatPanelSlots {
  renderCall?: (props: {
    kind: "audio" | "video"
    participants: MessagingMember[]
    startedAt: string
    onLeave: () => void
  }) => React.ReactNode
  renderMeetingDialog?: (props: {
    conversationId: string
    open: boolean
    onOpenChange: (open: boolean) => void
  }) => React.ReactNode
}

export function ChatPanel({
  conversation,
  onOpenDetails,
  onOpenSearch,
  onReply,
  slots = {},
}: {
  conversation: Conversation
  onOpenDetails: () => void
  onOpenSearch: () => void
  onReply: (messageId: string) => void
  slots?: ChatPanelSlots
}) {
  const { getMember } = useMessaging()
  const [meetingOpen, setMeetingOpen] = React.useState(false)
  const [call, setCall] = React.useState<{
    kind: "audio" | "video"
    startedAt: string
  } | null>(null)

  const participants = conversation.memberIds
    .map((id) => getMember(id))
    .filter((member): member is MessagingMember => member !== undefined)

  return (
    <section className="flex h-full min-h-0 flex-col">
      <ChatHeader
        conversation={conversation}
        onToggleDetails={onOpenDetails}
        onOpenSearch={onOpenSearch}
        onStartCall={(kind) =>
          setCall({ kind, startedAt: new Date().toISOString() })
        }
      />

      {call && slots.renderCall
        ? slots.renderCall({
            kind: call.kind,
            participants,
            startedAt: call.startedAt,
            onLeave: () => setCall(null),
          })
        : null}

      <MessageList conversationId={conversation.id} onReply={onReply} />
      <MessageComposer
        conversationId={conversation.id}
        onScheduleMeeting={() => setMeetingOpen(true)}
      />

      {slots.renderMeetingDialog
        ? slots.renderMeetingDialog({
            conversationId: conversation.id,
            open: meetingOpen,
            onOpenChange: setMeetingOpen,
          })
        : null}
    </section>
  )
}
