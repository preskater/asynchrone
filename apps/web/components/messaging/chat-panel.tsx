"use client"

import * as React from "react"

import { ChatHeader } from "@/components/messaging/chat-header"
import { MessageComposer } from "@/components/messaging/message-composer"
import { MessageList } from "@/components/messaging/message-list"
import { CallControls } from "@/components/meetings/call-controls"
import { MeetingDialog } from "@/components/meetings/meeting-dialog"

import { useMessaging } from "@/lib/messaging/store"
import type { Conversation } from "@/lib/messaging/types"
import type { Member } from "@workspace/projects/types"

export function ChatPanel({
  conversation,
  onOpenDetails,
  onOpenSearch,
  onReply,
}: {
  conversation: Conversation
  onOpenDetails: () => void
  onOpenSearch: () => void
  onReply: (messageId: string) => void
}) {
  const { getMember } = useMessaging()
  const [meetingOpen, setMeetingOpen] = React.useState(false)
  const [call, setCall] = React.useState<{
    kind: "audio" | "video"
    startedAt: string
  } | null>(null)

  const participants = conversation.memberIds
    .map((id) => getMember(id))
    .filter((member): member is Member => member !== undefined)

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

      {call ? (
        <CallControls
          kind={call.kind}
          participants={participants}
          startedAt={call.startedAt}
          onLeave={() => setCall(null)}
        />
      ) : null}

      <MessageList conversationId={conversation.id} onReply={onReply} />
      <MessageComposer
        conversationId={conversation.id}
        onScheduleMeeting={() => setMeetingOpen(true)}
      />

      <MeetingDialog
        conversationId={conversation.id}
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        trigger={<span className="hidden" />}
      />
    </section>
  )
}
