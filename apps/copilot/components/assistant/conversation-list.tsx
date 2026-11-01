"use client"

import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"

import type { AssistantConversationSummary } from "@workspace/ai/conversations"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

/**
 * The conversation rail, rendered once on desktop and once inside the mobile
 * sheet. It is presentational: the store owns the list and the active id, and
 * the workspace owns the delete confirmation.
 */
export function ConversationNav({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onRequestDelete,
  busy,
  className,
}: {
  conversations: AssistantConversationSummary[]
  activeId: string | null
  onSelect: (conversationId: string) => void
  onNewChat: () => void
  onRequestDelete: (conversation: AssistantConversationSummary) => void
  /** A conversation is being created; the button must not double-submit. */
  busy?: boolean
  className?: string
}) {
  const t = useTranslations("Assistant")
  const format = useFormatter()
  // Relative time depends on "now": rendering it on the server and hydrating a
  // second later is a text mismatch. Show it only after hydration.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={onNewChat}
          disabled={busy}
        >
          <PlusIcon data-icon="inline-start" />
          {t("newChat")}
        </Button>
      </div>

      {conversations.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {t("noConversations")}
        </p>
      ) : (
        <nav
          aria-label={t("conversationList")}
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        >
          <ul className="flex flex-col gap-0.5">
            {conversations.map((conversation) => {
              const title =
                conversation.title.trim() || t("untitledConversation")
              const active = conversation.id === activeId
              const updatedAt = new Date(conversation.updatedAt)
              const timestamp =
                mounted && !Number.isNaN(updatedAt.getTime())
                  ? format.relativeTime(updatedAt)
                  : null

              return (
                <li
                  key={conversation.id}
                  className="group/conversation flex items-center gap-1"
                >
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-start text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                      active && "bg-muted"
                    )}
                  >
                    <span className="w-full truncate">{title}</span>
                    {timestamp && mounted ? (
                      <span className="text-xs text-muted-foreground">
                        {timestamp}
                      </span>
                    ) : null}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("deleteConversation", { title })}
                    onClick={() => onRequestDelete(conversation)}
                    className="opacity-0 group-hover/conversation:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </div>
  )
}

/** Shown while a conversation is loading, so the welcome screen never flashes. */
export function ConversationLoading({ className }: { className?: string }) {
  const t = useTranslations("Assistant")

  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "flex min-h-0 flex-1 flex-col justify-center gap-3",
        className
      )}
    >
      <span className="sr-only">{t("loadingConversation")}</span>
      <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="ms-auto h-10 w-3/5 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
    </div>
  )
}
