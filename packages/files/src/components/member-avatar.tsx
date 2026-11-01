"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { cn } from "@workspace/ui/lib/utils"

import type { FilesMember } from "../types"

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/** Member avatar for file shares, versions and activity. */
export function MemberAvatar({
  member,
  size = "default",
  className,
}: {
  member?: FilesMember
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
