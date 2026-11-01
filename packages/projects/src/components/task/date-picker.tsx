"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import { formatDate } from "../../types"

export function DatePicker({
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
  const locale = useLocale()
  const [open, setOpen] = React.useState(false)
  const selected = value ? new Date(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start font-normal",
              !value && "text-muted-foreground",
              className
            )}
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {value ? formatDate(value, locale) : (placeholder ?? t("pickDate"))}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? date.toISOString() : undefined)
            setOpen(false)
          }}
          autoFocus
        />
        {value ? (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange(undefined)
                setOpen(false)
              }}
            >
              {t("clearDate")}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
