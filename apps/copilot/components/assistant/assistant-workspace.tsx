"use client"

import * as React from "react"
import {
  ArrowUpIcon,
  MessageSquareIcon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { AssistantMessage } from "@/components/assistant/assistant-message"
import {
  ConversationLoading,
  ConversationNav,
} from "@/components/assistant/conversation-list"
import { PlanUpgradePrompt } from "@/components/organization/plan-upgrade-prompt"
import type { AssistantConversationSummary } from "@workspace/ai/conversations"
import { suggestions } from "@workspace/ai/suggestions"
import { useAssistant } from "@workspace/ai/use-assistant"
import { useErrorTranslator } from "@workspace/i18n/errors"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@workspace/ui/components/message-scroller"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { useEntitlements } from "@/lib/organization/use-entitlements"

export function AssistantWorkspace() {
  const t = useTranslations("Assistant")
  const {
    messages,
    conversations,
    conversationId,
    sendMessage,
    newConversation,
    selectConversation,
    deleteConversation,
    retry,
    status,
    error,
  } = useAssistant()
  const [input, setInput] = React.useState("")
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [pendingDelete, setPendingDelete] =
    React.useState<AssistantConversationSummary | null>(null)
  const aiEnabled = useEntitlements().can("aiBudgetMicrosPerSeat")
  const te = useErrorTranslator()
  const quotaReached =
    (error as { code?: string } | null)?.code === "quota_exceeded"

  const isBusy = status === "submitted" || status === "streaming"
  const isCreating = status === "loading" && messages.length === 0
  const isLoading = status === "loading"
  const isEmpty = messages.length === 0 && !isLoading
  // One polite status instead of announcing every streamed token.
  const announcement = isBusy
    ? t("thinking")
    : messages.at(-1)?.role === "assistant"
      ? t("responseReady")
      : ""

  function submit(text: string) {
    const value = text.trim()
    if (!value || isBusy || isLoading || !aiEnabled) return
    void sendMessage({ text: value })
    setInput("")
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    submit(input)
  }

  function handleSelect(conversationIdToOpen: string) {
    setSheetOpen(false)
    selectConversation(conversationIdToOpen)
  }

  function handleNewChat() {
    setSheetOpen(false)
    void newConversation()
  }

  async function confirmDelete() {
    const target = pendingDelete
    if (!target) return
    setPendingDelete(null)
    await deleteConversation(target.id)
  }

  const conversationNav = (
    <ConversationNav
      conversations={conversations}
      activeId={conversationId}
      onSelect={handleSelect}
      onNewChat={handleNewChat}
      onRequestDelete={setPendingDelete}
      busy={isCreating}
      className="h-full"
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside
        data-testid="conversation-rail"
        className="hidden w-64 shrink-0 flex-col border-e bg-sidebar/40 md:flex"
      >
        {conversationNav}
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          data-testid="conversation-bar"
          className="flex items-center gap-2 border-b px-3 py-2 md:hidden"
        >
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              render={
                <Button variant="outline" size="sm" className="min-w-0" />
              }
            >
              <MessageSquareIcon data-icon="inline-start" />
              <span className="truncate">{t("conversations")}</span>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <SheetHeader>
                <SheetTitle>{t("conversations")}</SheetTitle>
                <SheetDescription className="sr-only">
                  {t("conversationListDescription")}
                </SheetDescription>
              </SheetHeader>
              <div data-testid="conversation-sheet" className="min-h-0 flex-1">
                {conversationNav}
              </div>
            </SheetContent>
          </Sheet>

          <Button
            size="sm"
            className="ms-auto shrink-0"
            onClick={handleNewChat}
            disabled={isCreating}
          >
            <PlusIcon data-icon="inline-start" />
            {t("newChat")}
          </Button>
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4">
          {isLoading ? (
            <ConversationLoading className="px-2 py-6" />
          ) : isEmpty ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <SparklesIcon className="size-6" />
                </span>
                <h2 className="text-lg font-semibold">{t("title")}</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t("subtitle")}
                </p>
              </div>
              {aiEnabled ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.labelKey}
                      type="button"
                      onClick={() => submit(t(suggestion.promptKey as never))}
                      className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
                    >
                      {t(suggestion.labelKey as never)}
                    </button>
                  ))}
                </div>
              ) : (
                <PlanUpgradePrompt feature="ai" className="max-w-md" />
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <MessageScrollerProvider autoScroll>
                <MessageScroller>
                  <MessageScrollerViewport className="py-6">
                    <MessageScrollerContent className="gap-4">
                      {messages.map((message) => (
                        <MessageScrollerItem
                          key={message.id}
                          messageId={message.id}
                          scrollAnchor={message.role === "user"}
                        >
                          <AssistantMessage message={message} />
                        </MessageScrollerItem>
                      ))}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton />
                </MessageScroller>
              </MessageScrollerProvider>
            </div>
          )}

          {error ? (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <span className="flex-1">{te(error)}</span>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 text-destructive"
                onClick={retry}
              >
                {t("retry")}
              </Button>
            </div>
          ) : null}
          {quotaReached ? (
            <PlanUpgradePrompt feature="aiQuota" className="mb-3" />
          ) : null}

          <div role="status" className="sr-only">
            {announcement}
          </div>

          {isBusy ? (
            <div className="mb-2 flex justify-center">
              <Badge
                variant="secondary"
                className="shimmer motion-reduce:animate-none"
              >
                {t("thinking")}
              </Badge>
            </div>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="mb-4 flex items-center gap-2 rounded-2xl border bg-popover p-2 shadow-sm"
          >
            <SparklesIcon className="ms-1.5 size-4 shrink-0 text-muted-foreground" />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("placeholder")}
              aria-label={t("ask")}
              disabled={!aiEnabled || isLoading}
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button
              type="submit"
              size="icon-sm"
              aria-label={t("send")}
              disabled={!input.trim() || isBusy || isLoading || !aiEnabled}
            >
              <ArrowUpIcon />
            </Button>
          </form>
        </div>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConversationTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConversationDescription", {
                title: pendingDelete?.title.trim() || t("untitledConversation"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
