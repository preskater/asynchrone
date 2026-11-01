"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { MessageItem } from "./message-item"
import { MessageComposer } from "./message-composer"
import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"

import { useMessaging } from "../store"

export function ThreadSheet({
  messageId,
  open,
  onOpenChange,
}: {
  messageId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Messaging")
  const { messages, repliesFor } = useMessaging()
  const parent = messageId
    ? messages.find((message) => message.id === messageId)
    : undefined

  if (!parent) return null
  const replies = repliesFor(parent.id)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("thread")}</SheetTitle>
          <SheetDescription className="line-clamp-1">
            {parent.body || t("sharedAMeeting")}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          <MessageItem message={parent} onReply={() => {}} compact />
          <div className="my-2 px-4 text-xs font-medium text-muted-foreground">
            {t("replyCount", { count: replies.length })}
          </div>
          {replies.map((reply) => (
            <MessageItem
              key={reply.id}
              message={reply}
              onReply={() => {}}
              compact
            />
          ))}
        </div>
        <MessageComposer
          conversationId={parent.conversationId}
          parentId={parent.id}
        />
      </SheetContent>
    </Sheet>
  )
}
