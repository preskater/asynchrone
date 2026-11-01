"use client"

import { cn } from "@workspace/ui/lib/utils"

import { useMessaging } from "../store"
import type { Reaction } from "../types"

export function ReactionBar({
  messageId,
  reactions,
  className,
}: {
  messageId: string
  reactions: Reaction[]
  className?: string
}) {
  const { toggleReaction, currentUserId } = useMessaging()

  if (reactions.length === 0) return null

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {reactions.map((reaction) => {
        const mine = reaction.memberIds.includes(currentUserId)
        return (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => toggleReaction(messageId, reaction.emoji)}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
              mine
                ? "border-primary/30 bg-primary/10 text-foreground"
                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
            aria-pressed={mine}
          >
            <span>{reaction.emoji}</span>
            <span className="tabular-nums">{reaction.memberIds.length}</span>
          </button>
        )
      })}
    </div>
  )
}
