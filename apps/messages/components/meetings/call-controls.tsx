"use client"

import * as React from "react"
import {
  Grid2x2Icon,
  MicIcon,
  MicOffIcon,
  MonitorUpIcon,
  MoreHorizontalIcon,
  PhoneOffIcon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { MemberAvatar } from "@workspace/messaging/components/member-avatar"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { formatTime } from "@workspace/messaging/format"
import type { MessagingMember } from "@workspace/messaging/types"

export function CallControls({
  kind,
  participants,
  startedAt,
  onLeave,
}: {
  kind: "audio" | "video"
  participants: MessagingMember[]
  startedAt: string
  onLeave: () => void
}) {
  const t = useTranslations("Meetings")
  const locale = useLocale()
  const [muted, setMuted] = React.useState(false)
  const [videoOn, setVideoOn] = React.useState(kind === "video")
  const [sharing, setSharing] = React.useState(false)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {kind === "video" ? t("videoCall") : t("audioCall")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("startedAt", {
              time: formatTime(startedAt, locale),
              count: participants.length,
            })}
          </span>
        </div>
        <div className="flex -space-x-2">
          {participants.slice(0, 5).map((member) => (
            <MemberAvatar key={member.id} member={member} size="sm" />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={muted ? "destructive" : "outline"}
                size="icon"
                aria-label={muted ? t("unmute") : t("mute")}
                onClick={() => setMuted((prev) => !prev)}
              />
            }
          >
            {muted ? <MicOffIcon /> : <MicIcon />}
          </TooltipTrigger>
          <TooltipContent>{muted ? t("unmute") : t("mute")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={videoOn ? "default" : "outline"}
                size="icon"
                aria-label={videoOn ? t("stopVideo") : t("startVideo")}
                onClick={() => setVideoOn((prev) => !prev)}
              />
            }
          >
            {videoOn ? <VideoIcon /> : <VideoOffIcon />}
          </TooltipTrigger>
          <TooltipContent>
            {videoOn ? t("stopVideo") : t("startVideo")}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={sharing ? "default" : "outline"}
                size="icon"
                aria-label={sharing ? t("stopSharing") : t("shareScreen")}
                onClick={() => setSharing((prev) => !prev)}
              />
            }
          >
            <MonitorUpIcon />
          </TooltipTrigger>
          <TooltipContent>
            {sharing ? t("stopSharing") : t("shareScreen")}
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={t("moreOptions")}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => toast.info(t("participantsPanel"))}
              >
                <Grid2x2Icon />
                {t("viewParticipants")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            toast.success(t("youLeft"))
            onLeave()
          }}
        >
          <PhoneOffIcon data-icon="inline-start" />
          {t("leave")}
        </Button>
      </div>
    </div>
  )
}
