"use client"

import { useTranslations } from "next-intl"
import { SparklesIcon, WrenchIcon } from "lucide-react"

import {
  getToolName,
  isReasoningPart,
  isTextPart,
  isToolPart,
  type ChatMessage,
} from "@workspace/ai/chat"

import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@workspace/ui/components/message"
import { Badge } from "@workspace/ui/components/badge"

import { Markdown } from "@/components/assistant/markdown"

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
                  <span className={part.state === "streaming" ? "shimmer" : ""}>
                    {part.text || t("thinkingEllipsis")}
                  </span>
                </BubbleContent>
              </Bubble>
            )
          }

          if (isToolPart(part)) {
            return (
              <Bubble key={`tool-${index}`} variant="outline" align="start">
                <BubbleContent className="flex items-center gap-2 text-xs">
                  <WrenchIcon className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">{getToolName(part)}</span>
                  <Badge variant="secondary">{part.state}</Badge>
                </BubbleContent>
              </Bubble>
            )
          }

          return null
        })}
      </MessageContent>
    </Message>
  )
}
