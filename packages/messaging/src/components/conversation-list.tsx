"use client"

import * as React from "react"
import { ChevronRightIcon, MessageCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { ConversationItem } from "./conversation-item"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"

import { useMessaging } from "../store"
import type { Conversation } from "../types"

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
      {children}
    </p>
  )
}

function TeamGroup({
  label,
  conversations,
  activeId,
  onSelect,
  defaultOpen = true,
}: {
  label: string
  conversations: Conversation[]
  activeId?: string
  onSelect: (id: string) => void
  defaultOpen?: boolean
}) {
  if (conversations.length === 0) return null
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="group/trigger flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRightIcon className="size-3.5 transition-transform group-data-open/trigger:rotate-90" />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-0.5 pt-0.5">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            active={conversation.id === activeId}
            onSelect={onSelect}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ConversationList({
  activeId,
  onSelect,
  query,
}: {
  activeId?: string
  onSelect: (id: string) => void
  query: string
}) {
  const t = useTranslations("Messaging")
  const { teams, conversations } = useMessaging()

  const matches = React.useCallback(
    (conversation: Conversation) =>
      conversation.name.toLowerCase().includes(query.toLowerCase()),
    [query]
  )

  const pinned = conversations.filter(
    (conversation) =>
      conversation.pinned &&
      conversation.kind === "channel" &&
      matches(conversation)
  )
  const dms = conversations.filter(
    (conversation) => conversation.kind === "dm" && matches(conversation)
  )

  return (
    <div className="flex flex-col gap-0.5 px-1.5 pb-2">
      {pinned.length ? (
        <>
          <SectionLabel>{t("pinned")}</SectionLabel>
          {pinned.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeId}
              onSelect={onSelect}
            />
          ))}
        </>
      ) : null}

      {teams.map((team) => {
        const teamChannels = team.channelIds
          .map((id) => conversations.find((c) => c.id === id))
          .filter((c): c is Conversation => c !== undefined && matches(c))
        return (
          <React.Fragment key={team.id}>
            <SectionLabel>{team.name}</SectionLabel>
            <TeamGroup
              label={t("channels")}
              conversations={teamChannels}
              activeId={activeId}
              onSelect={onSelect}
            />
          </React.Fragment>
        )
      })}

      {dms.length ? (
        <>
          <SectionLabel>{t("directMessages")}</SectionLabel>
          {dms.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeId}
              onSelect={onSelect}
            />
          ))}
        </>
      ) : null}

      {pinned.length === 0 && dms.length === 0 && teams.length === 0 ? (
        <p className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
          <MessageCircleIcon className="size-4" />
          {t("noConversations")}
        </p>
      ) : null}
    </div>
  )
}
