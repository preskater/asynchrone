"use client"

import {
  MessagingWorkspace,
  type MessagingWorkspaceSlots,
} from "@workspace/messaging/components/messaging-workspace"

import { CallControls } from "@/components/meetings/call-controls"
import { MeetingDialog } from "@/components/meetings/meeting-dialog"
import { useMessagesNavigation } from "@/components/messages-navigation"

/**
 * The messages app's workspace: it supplies the navigation state and the
 * meetings UI the package takes as slots. Calls and meeting cards are still
 * rendered by the workspace that owns the conversation; they move to
 * `apps/calendars` with the rest of the meetings surface.
 */
export function MessagesWorkspace() {
  const navigation = useMessagesNavigation()

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

  return <MessagingWorkspace navigation={navigation} slots={slots} />
}
