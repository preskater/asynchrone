"use client"

import * as React from "react"
import { PlusIcon, SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { ConversationList } from "./conversation-list"
import { NewMessageDialog } from "./new-message-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

import { useMessaging } from "../store"
import type { MessagingNavigation } from "./navigation"

export function ConversationSidebar({
  navigation,
}: {
  navigation: MessagingNavigation
}) {
  const t = useTranslations("Messaging")
  const { unreadTotal } = useMessaging()
  const { activeId, selectConversation, setSearchOpen } = navigation
  const [query, setQuery] = React.useState("")

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{t("chat")}</h2>
          {unreadTotal > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("unreadCount", { count: unreadTotal })}
            </span>
          ) : null}
        </div>
        <NewMessageDialog
          onStart={(id) => selectConversation(id)}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={t("newMessage")}>
              <PlusIcon />
            </Button>
          }
        />
      </div>

      <div className="px-3 pb-2">
        <InputGroup>
          <InputGroupInput
            placeholder={t("searchConversations")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                setSearchOpen(true)
              }
            }}
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ConversationList
          activeId={activeId}
          onSelect={selectConversation}
          query={query}
        />
      </ScrollArea>
    </div>
  )
}
