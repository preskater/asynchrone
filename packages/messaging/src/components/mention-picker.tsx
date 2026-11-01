"use client"

import { AtSignIcon, SlashIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { MemberAvatar } from "./member-avatar"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { useMessaging } from "../store"

export interface SlashCommand {
  name: string
  description: "scheduleMeeting" | "startAudioCall" | "appendShrug"
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: "meeting", description: "scheduleMeeting" },
  { name: "call", description: "startAudioCall" },
  { name: "shrug", description: "appendShrug" },
]

export function CommandPopover({
  onCommand,
  trigger,
}: {
  onCommand: (command: SlashCommand) => void
  trigger: React.ReactElement
}) {
  const t = useTranslations("Messaging")
  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={t("typeCommand")} />
          <CommandList>
            <CommandEmpty>{t("noCommands")}</CommandEmpty>
            <CommandGroup heading={t("commands")}>
              {SLASH_COMMANDS.map((command) => (
                <CommandItem
                  key={command.name}
                  value={command.name}
                  onSelect={() => onCommand(command)}
                >
                  <SlashIcon />
                  <span className="flex flex-col">
                    <span>/{command.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t(command.description)}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function MentionPopover({
  onMention,
  trigger,
}: {
  onMention: (memberId: string, name: string) => void
  trigger: React.ReactElement
}) {
  const t = useTranslations("Messaging")
  const { members, currentUserId } = useMessaging()
  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={t("mentionPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t("noMembers")}</CommandEmpty>
            <CommandGroup heading={t("members")}>
              {members
                .filter((member) => member.id !== currentUserId)
                .map((member) => (
                  <CommandItem
                    key={member.id}
                    value={member.name}
                    onSelect={() => onMention(member.id, member.name)}
                  >
                    <MemberAvatar member={member} size="sm" />
                    <span>{member.name}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { SLASH_COMMANDS }
