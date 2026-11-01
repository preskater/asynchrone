"use client"

import * as React from "react"
import {
  BellOffIcon,
  HashIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PhoneIcon,
  PinIcon,
  SearchIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { MemberAvatar } from "./member-avatar"
import { PresenceDot } from "./presence-dot"
import { AvatarGroup } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { useMessaging } from "../store"
import type { Conversation } from "../types"

export function ChatHeader({
  conversation,
  onToggleDetails,
  onStartCall,
  onOpenSearch,
}: {
  conversation: Conversation
  onToggleDetails: () => void
  onStartCall: (kind: "audio" | "video") => void
  onOpenSearch: () => void
}) {
  const t = useTranslations("Messaging")
  const { getMember, dmPartner, toggleMute, togglePin, presence } =
    useMessaging()
  const members = conversation.memberIds
    .map((id) => getMember(id))
    .filter((member) => member !== undefined)
  const partnerId = dmPartner(conversation)
  const partner = getMember(partnerId)

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {conversation.kind === "channel" ? (
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <HashIcon className="size-4" />
          </span>
        ) : (
          <div className="relative size-8 shrink-0">
            <MemberAvatar member={partner} />
            <PresenceDot
              presence={partnerId ? presence[partnerId] : undefined}
            />
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">
              {conversation.kind === "channel"
                ? `#${conversation.name}`
                : (partner?.name ?? t("directMessage"))}
            </h2>
            {conversation.pinned ? (
              <PinIcon className="size-3 shrink-0 text-muted-foreground" />
            ) : null}
            {conversation.muted ? (
              <Badge variant="outline">{t("muted")}</Badge>
            ) : null}
          </div>
          {conversation.topic ? (
            <p className="truncate text-xs text-muted-foreground">
              {conversation.topic}
            </p>
          ) : partner ? (
            <p className="truncate text-xs text-muted-foreground">
              {partner.email}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {conversation.kind === "channel" ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("viewMembers")}
                  onClick={onToggleDetails}
                />
              }
            >
              <AvatarGroup>
                {members.slice(0, 4).map((member) => (
                  <MemberAvatar key={member.id} member={member} size="sm" />
                ))}
              </AvatarGroup>
            </TooltipTrigger>
            <TooltipContent>
              {t("membersCount", { count: members.length })}
            </TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("searchMessages")}
                onClick={onOpenSearch}
              />
            }
          >
            <SearchIcon />
          </TooltipTrigger>
          <TooltipContent>{t("searchLabel")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("startAudioCall")}
                onClick={() => onStartCall("audio")}
              />
            }
          >
            <PhoneIcon />
          </TooltipTrigger>
          <TooltipContent>{t("audioCall")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("startVideoCall")}
                onClick={() => onStartCall("video")}
              />
            }
          >
            <VideoIcon />
          </TooltipTrigger>
          <TooltipContent>{t("videoCall")}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("moreOptions")}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={onToggleDetails}>
                <InfoIcon />
                {t("conversationDetails")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => togglePin(conversation.id)}>
                <PinIcon />
                {conversation.pinned
                  ? t("unpinConversation")
                  : t("pinConversation")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toggleMute(conversation.id)}>
                <BellOffIcon />
                {conversation.muted
                  ? t("unmuteNotifications")
                  : t("muteNotifications")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onStartCall("audio")}>
                <UsersIcon />
                {t("meetNow")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
