"use client"

import * as React from "react"
import { ArrowUpIcon, SparklesIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { AssistantMessage } from "@/components/assistant/assistant-message"
import { PlanUpgradePrompt } from "@/components/organization/plan-upgrade-prompt"
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

import { suggestions } from "@workspace/ai/suggestions"
import { useAssistant } from "@workspace/ai/use-assistant"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEntitlements } from "@/lib/organization/use-entitlements"

export function AssistantWorkspace() {
  const t = useTranslations("Assistant")
  const { messages, sendMessage, status, error } = useAssistant()
  const [input, setInput] = React.useState("")
  const aiEnabled = useEntitlements().can("aiBudgetMicrosPerSeat")
  const te = useErrorTranslator()
  const quotaReached =
    (error as { code?: string } | null)?.code === "quota_exceeded"

  const isBusy = status === "submitted" || status === "streaming"
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4">
        {isEmpty ? (
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
                    className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
            className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {te(error)}
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
            <Badge variant="secondary" className="shimmer">
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
  )
}
