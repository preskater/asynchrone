"use client"

import * as React from "react"
import { UserIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { MemberAvatar } from "./member-avatar"
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
import { cn } from "@workspace/ui/lib/utils"

import { useProjectStore } from "../../ui/store"

export function MemberPicker({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: {
  value?: string
  onChange: (value?: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const t = useTranslations("Projects")
  const { members, getMember } = useProjectStore()
  const [open, setOpen] = React.useState(false)
  const selected = getMember(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-start font-normal", className)}
          />
        }
      >
        {selected ? (
          <>
            <MemberAvatar member={selected} size="sm" />
            {selected.name}
          </>
        ) : (
          <>
            <UserIcon data-icon="inline-start" />
            {placeholder ?? t("unassigned")}
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={t("searchMembers")} />
          <CommandList>
            <CommandEmpty>{t("noMembersFound")}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="unassigned"
                onSelect={() => {
                  onChange(undefined)
                  setOpen(false)
                }}
              >
                <UserIcon />
                {t("unassigned")}
              </CommandItem>
              {members.map((member) => (
                <CommandItem
                  key={member.id}
                  value={member.name}
                  onSelect={() => {
                    onChange(member.id)
                    setOpen(false)
                  }}
                >
                  <MemberAvatar member={member} size="sm" />
                  <span className="truncate">{member.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
