"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { CheckIcon, UserPlusIcon, XIcon } from "lucide-react"

import { MemberAvatar } from "@workspace/projects/components/task/member-avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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

import { useCalendars } from "@/lib/calendars/store"

export interface AttendeeDraft {
  memberId: string
  response: "accepted" | "tentative" | "declined" | "pending"
}

export function AttendeePicker({
  value,
  onChange,
}: {
  value: AttendeeDraft[]
  onChange: (attendees: AttendeeDraft[]) => void
}) {
  const t = useTranslations("Calendars")
  const { members, getMember, currentUserId } = useCalendars()
  const [open, setOpen] = React.useState(false)

  function toggle(memberId: string) {
    if (value.some((attendee) => attendee.memberId === memberId)) {
      onChange(value.filter((attendee) => attendee.memberId !== memberId))
    } else {
      onChange([
        ...value,
        {
          memberId,
          response: memberId === currentUserId ? "accepted" : "pending",
        },
      ])
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-start font-normal"
            />
          }
        >
          <UserPlusIcon data-icon="inline-start" />
          {value.length
            ? t("attendeeCount", { count: value.length })
            : t("addAttendees")}
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={t("searchTeammates")} />
            <CommandList>
              <CommandEmpty>{t("noTeammates")}</CommandEmpty>
              <CommandGroup>
                {members
                  .filter((member) => member.id !== currentUserId)
                  .map((member) => {
                    const selected = value.some(
                      (attendee) => attendee.memberId === member.id
                    )
                    return (
                      <CommandItem
                        key={member.id}
                        value={member.name}
                        onSelect={() => toggle(member.id)}
                      >
                        <span className="flex size-4 items-center justify-center">
                          {selected ? <CheckIcon /> : null}
                        </span>
                        <MemberAvatar member={member} size="sm" />
                        <span className="truncate">{member.name}</span>
                      </CommandItem>
                    )
                  })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((attendee) => {
            const member = getMember(attendee.memberId)
            if (!member) return null
            return (
              <Badge
                key={attendee.memberId}
                variant="secondary"
                className="gap-1.5"
              >
                <MemberAvatar member={member} size="sm" />
                {member.name}
                <button
                  type="button"
                  aria-label={t("removeAttendee", { name: member.name })}
                  onClick={() =>
                    onChange(
                      value.filter(
                        (item) => item.memberId !== attendee.memberId
                      )
                    )
                  }
                >
                  <XIcon />
                </button>
              </Badge>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
