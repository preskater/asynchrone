"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"

import { MessageItem } from "./message-item"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { formatDayLabel, isSameDay } from "../format"
import { useMessaging } from "../store"

export function MessageList({
  conversationId,
  onReply,
}: {
  conversationId: string
  onReply: (messageId: string) => void
}) {
  const t = useTranslations("Messaging")
  const tc = useTranslations("Common")
  const locale = useLocale()
  const {
    messagesFor,
    typing,
    getMember,
    ensureMessages,
    loadOlderMessages,
    hasMoreMessages,
    messagesLoading,
  } = useMessaging()
  const messages = messagesFor(conversationId)
  const loading = messagesLoading[conversationId]
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    ensureMessages(conversationId)
  }, [conversationId, ensureMessages])

  React.useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight })
  }, [conversationId, messages.length])

  const typingIds = typing[conversationId] ?? []
  const typingNames = typingIds
    .map((id) => getMember(id)?.name.split(" ")[0])
    .filter(Boolean)

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-2">
      {hasMoreMessages(conversationId) ? (
        <div className="flex justify-center py-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={loading}
            onClick={() => loadOlderMessages(conversationId)}
          >
            {loading ? <Skeleton className="h-4 w-32" /> : t("loadEarlier")}
          </Button>
        </div>
      ) : null}
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-medium">{t("noMessagesYet")}</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("beFirst")}
          </p>
        </div>
      ) : (
        messages.map((message, index) => {
          const previous = messages[index - 1]
          const showDay =
            !previous || !isSameDay(previous.createdAt, message.createdAt)
          return (
            <React.Fragment key={message.id}>
              {showDay ? (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Separator className="flex-1" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatDayLabel(message.createdAt, locale, tc)}
                  </span>
                  <Separator className="flex-1" />
                </div>
              ) : null}
              <MessageItem message={message} onReply={onReply} />
            </React.Fragment>
          )
        })
      )}
      <div ref={bottomRef} />
      {typingNames.length > 0 ? (
        <TypingIndicator names={typingNames as string[]} />
      ) : null}
    </div>
  )
}

export function MessageListSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
        </div>
      ))}
    </div>
  )
}

function TypingIndicator({ names }: { names: string[] }) {
  const t = useTranslations("Messaging")
  const text =
    names.length === 1
      ? t("typing", { name: names[0] ?? "" })
      : t("typingTwo", {
          first: names.slice(0, -1).join(", "),
          second: names[names.length - 1] ?? "",
        })
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
      <span className="flex gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
      </span>
      {text}
    </div>
  )
}
