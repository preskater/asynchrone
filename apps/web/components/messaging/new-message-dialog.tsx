"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { MemberAvatar } from "@workspace/projects/components/task/member-avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"

import { useMessaging } from "@/lib/messaging/store"

export function NewMessageDialog({
  trigger,
  onStart,
}: {
  trigger: React.ReactElement
  onStart: (conversationId: string) => void
}) {
  const t = useTranslations("Messaging")
  const { startDirectMessage } = useMessaging()
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("newMessage")}</DialogTitle>
          <DialogDescription>{t("newMessageDescription")}</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder={t("searchTeammates")} />
          <CommandList>
            <CommandEmpty>{t("noTeammates")}</CommandEmpty>
            <CommandGroup heading={t("teammates")}>
              <NewMessageItem
                onPick={(id) => {
                  const conversationId = startDirectMessage(id)
                  setOpen(false)
                  onStart(conversationId)
                }}
              />
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function NewMessageItem({ onPick }: { onPick: (memberId: string) => void }) {
  const { members, currentUserId } = useMessaging()
  return (
    <>
      {members
        .filter((member) => member.id !== currentUserId)
        .map((member) => (
          <CommandItem
            key={member.id}
            value={member.name}
            onSelect={() => onPick(member.id)}
          >
            <MemberAvatar member={member} size="sm" />
            <span className="flex flex-col">
              <span>{member.name}</span>
              <span className="text-xs text-muted-foreground">
                {member.email}
              </span>
            </span>
          </CommandItem>
        ))}
    </>
  )
}
