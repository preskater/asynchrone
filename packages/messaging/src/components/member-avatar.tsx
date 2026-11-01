"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { cn } from "@workspace/ui/lib/utils"

import type { MessagingMember } from "../types"

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/** Member avatar for conversation members, mentions and message authors. */
export function MemberAvatar({
  member,
  size = "default",
  className,
}: {
  member?: MessagingMember
  size?: "sm" | "default" | "lg"
  className?: string
}) {
  return (
    <Avatar size={size} className={cn(className)}>
      {member?.avatarUrl ? (
        <AvatarImage src={member.avatarUrl} alt={member.name} />
      ) : null}
      <AvatarFallback>{member ? initialsFor(member.name) : "?"}</AvatarFallback>
    </Avatar>
  )
}
