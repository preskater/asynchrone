"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { MemberAvatar } from "./member-avatar"
import { PresenceDot } from "./presence-dot"
import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"

import { useMessaging } from "../store"
import type { Conversation } from "../types"

export function ConversationDetailsSheet({
  conversation,
  open,
  onOpenChange,
}: {
  conversation: Conversation
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Messaging")
  const { getMember, dmPartner, presence } = useMessaging()
  const partnerId = dmPartner(conversation)
  const partner = getMember(partnerId)
  const members = conversation.memberIds
    .map((id) => getMember(id))
    .filter((member) => member !== undefined)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b">
          <SheetTitle>
            {conversation.kind === "channel"
              ? `#${conversation.name}`
              : (partner?.name ?? t("directMessage"))}
          </SheetTitle>
          <SheetDescription>
            {conversation.topic ?? t("conversationDetails")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">{t("members")}</h3>
            <span className="text-xs text-muted-foreground">
              {t("membersInConversation", { count: members.length })}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-lg px-1 py-1.5"
              >
                <MemberAvatar member={member} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {member.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {member.email}
                  </span>
                </div>
                <PresenceDot
                  presence={presence[member.id]}
                  label
                  className="shrink-0"
                />
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full">
            {t("addMembers")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
