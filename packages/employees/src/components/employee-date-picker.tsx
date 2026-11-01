"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { useLocale } from "next-intl"
import type { Matcher } from "react-day-picker"
import { enUS, fr } from "react-day-picker/locale"

import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import { formatDateKey, localDateFromKey, localDateKey } from "../date-utils"

const DAY_PICKER_LOCALES = { en: enUS, fr }

/**
 * Date picker for employee day keys ("YYYY-MM-DD"). Works in the user's local time
 * (unlike ISO timestamps) so the selected day never shifts across timezones.
 */
export function EmployeeDatePicker({
  id,
  value,
  onChange,
  placeholder,
  disabledBefore,
  disabledAfter,
  disabled,
  className,
  invalid,
  "aria-describedby": describedBy,
}: {
  id?: string
  value?: string
  onChange: (value: string) => void
  placeholder: string
  disabledBefore?: string
  disabledAfter?: string
  disabled?: boolean
  className?: string
  invalid?: boolean
  "aria-describedby"?: string
}) {
  const locale = useLocale()
  const [open, setOpen] = React.useState(false)
  const selected = value ? localDateFromKey(value) : undefined

  const disabledMatchers: Matcher[] = []
  if (disabledBefore) {
    disabledMatchers.push({ before: localDateFromKey(disabledBefore) })
  }
  if (disabledAfter) {
    disabledMatchers.push({ after: localDateFromKey(disabledAfter) })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={cn(
              "w-full justify-start font-normal",
              !value && "text-muted-foreground",
              className
            )}
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {value
          ? formatDateKey(value, locale, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : placeholder}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={DAY_PICKER_LOCALES[locale as keyof typeof DAY_PICKER_LOCALES]}
          selected={selected}
          defaultMonth={selected}
          disabled={disabledMatchers.length ? disabledMatchers : undefined}
          onSelect={(date) => {
            if (!date) return
            onChange(localDateKey(date))
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
