"use client"

import {
  MessagingWorkspace,
  type MessagingWorkspaceSlots,
} from "@workspace/messaging/components/messaging-workspace"

import { CallControls } from "@/components/meetings/call-controls"
import { MeetingDialog } from "@/components/meetings/meeting-dialog"
import { useWorkspaceNav } from "@/lib/workspace-nav/store"

/**
 * Copilot's binding of the messaging workspace: it supplies the workspace
 * navigation and the meetings UI (CallControls and MeetingDialog still live in
 * this app until `apps/calendars` owns them).
 */
export function MessagesWorkspace() {
  const {
    messagesActiveId,
    selectConversation,
    messagesSearchOpen,
    setMessagesSearchOpen,
  } = useWorkspaceNav()

  const slots: MessagingWorkspaceSlots = {
    renderCall: ({ kind, participants, startedAt, onLeave }) => (
      <CallControls
        kind={kind}
        participants={participants}
        startedAt={startedAt}
        onLeave={onLeave}
      />
    ),
    renderMeetingDialog: ({ conversationId, open, onOpenChange }) => (
      <MeetingDialog
        conversationId={conversationId}
        open={open}
        onOpenChange={onOpenChange}
        trigger={<span className="hidden" />}
      />
    ),
  }

  return (
    <MessagingWorkspace
      navigation={{
        activeId: messagesActiveId,
        selectConversation,
        searchOpen: messagesSearchOpen,
        setSearchOpen: setMessagesSearchOpen,
      }}
      slots={slots}
    />
  )
}
