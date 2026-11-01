"use client"

import { useTranslations } from "next-intl"
import { ChevronRightIcon, SparklesIcon, WrenchIcon } from "lucide-react"

import {
  getToolName,
  isReasoningPart,
  isTextPart,
  isToolPart,
  type ChatMessage,
  type ToolPart,
} from "@workspace/ai/chat"

import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@workspace/ui/components/message"
import { Badge } from "@workspace/ui/components/badge"

import { Markdown } from "@/components/assistant/markdown"

function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function ToolCard({ part }: { part: ToolPart }) {
  const t = useTranslations("Assistant")
  const done = part.state === "output"

  return (
    <Bubble variant="outline" align="start">
      <BubbleContent>
        <details className="group/tool min-w-0">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/tool:rotate-90 motion-reduce:transition-none" />
            <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{getToolName(part)}</span>
            <Badge variant="secondary">
              {done ? t("toolDone") : t("toolRunning")}
            </Badge>
          </summary>
          <div className="mt-2 flex flex-col gap-1.5 border-t pt-2">
            {part.args ? (
              <div className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-medium text-muted-foreground">
                  {t("toolArguments")}
                </span>
                <pre className="max-h-40 overflow-auto rounded-md bg-muted/60 p-2 text-[0.7rem] whitespace-pre-wrap">
                  {prettyJson(part.args)}
                </pre>
              </div>
            ) : null}
            {done && part.output ? (
              <div className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-medium text-muted-foreground">
                  {t("toolOutput")}
                </span>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted/60 p-2 text-[0.7rem] whitespace-pre-wrap">
                  {prettyJson(part.output)}
                </pre>
              </div>
            ) : null}
          </div>
        </details>
      </BubbleContent>
    </Bubble>
  )
}

export function AssistantMessage({ message }: { message: ChatMessage }) {
  const t = useTranslations("Assistant")
  const isUser = message.role === "user"

  return (
    <Message align={isUser ? "end" : "start"}>
      {!isUser ? (
        <MessageAvatar>
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <SparklesIcon className="size-4" />
          </span>
        </MessageAvatar>
      ) : null}
      <MessageContent>
        {message.parts.map((part, index) => {
          if (isTextPart(part)) {
            return (
              <Bubble
                key={`text-${index}`}
                variant={isUser ? "default" : "muted"}
                align={isUser ? "end" : "start"}
              >
                <BubbleContent>
                  {isUser ? (
                    <span className="whitespace-pre-wrap">{part.text}</span>
                  ) : (
                    <Markdown>{part.text}</Markdown>
                  )}
                </BubbleContent>
              </Bubble>
            )
          }

          if (isReasoningPart(part)) {
            return (
              <Bubble key={`reasoning-${index}`} variant="ghost" align="start">
                <BubbleContent className="flex items-start gap-1.5 text-xs text-muted-foreground italic">
                  <SparklesIcon className="mt-0.5 size-3 shrink-0" />
                  <span
                    className={
                      part.state === "streaming"
                        ? "shimmer motion-reduce:animate-none"
                        : ""
                    }
                  >
                    {part.text || t("thinkingEllipsis")}
                  </span>
                </BubbleContent>
              </Bubble>
            )
          }

          if (isToolPart(part)) {
            return <ToolCard key={`tool-${part.callId || index}`} part={part} />
          }

          return null
        })}
      </MessageContent>
    </Message>
  )
}
