"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { CalendarPlusIcon, UsersIcon } from "lucide-react"

import { MemberAvatar } from "@workspace/projects/components/task/member-avatar"
import { MiniCalendar } from "@/components/calendars/mini-calendar"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

import { EVENT_COLOR_VAR } from "@/lib/calendars/event-colors"
import { useCalendars } from "@/lib/calendars/store"
import {
  EVENT_COLORS,
  type CalendarKind,
  type EventColor,
} from "@workspace/calendars/types"
import { useWorkspaceNav } from "@/lib/workspace-nav/store"

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
      {children}
    </p>
  )
}

function CalendarRow({
  id,
  name,
  color,
  checked,
  onToggle,
}: {
  id: string
  name: string
  color: EventColor
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm transition-colors hover:bg-muted/60"
    >
      <Checkbox id={id} checked={checked} onCheckedChange={onToggle} />
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: EVENT_COLOR_VAR[color] }}
      />
      <span className="truncate">{name}</span>
    </label>
  )
}

function AddCalendarDialog() {
  const { addCalendar } = useCalendars()
  const t = useTranslations("Calendars")
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [kind, setKind] = React.useState<CalendarKind>("personal")
  const [color, setColor] = React.useState<EventColor>("blue")
  const [submitted, setSubmitted] = React.useState(false)
  const nameInvalid = submitted && !name.trim()

  const kindItems = [
    { label: "Personal", value: "personal" },
    { label: "Team", value: "team" },
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setSubmitted(false)
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="w-full justify-start" />
        }
      >
        <CalendarPlusIcon data-icon="inline-start" />
        Add calendar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add calendar</DialogTitle>
          <DialogDescription>
            Create a personal or team calendar to organise events.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
            if (!name.trim()) return
            addCalendar(name.trim(), kind, color)
            setName("")
            setOpen(false)
          }}
        >
          <FieldGroup>
            <Field data-invalid={nameInvalid}>
              <FieldLabel htmlFor="calendar-name">Name</FieldLabel>
              <Input
                id="calendar-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Field Sales"
                aria-invalid={nameInvalid}
                autoFocus
              />
              {nameInvalid ? (
                <FieldError>{t("nameRequired")}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="calendar-kind">Type</FieldLabel>
              <Select
                items={kindItems}
                value={kind}
                onValueChange={(value) => setKind(value as CalendarKind)}
              >
                <SelectTrigger id="calendar-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {kindItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Color</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {EVENT_COLORS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-label={item.label}
                    aria-pressed={color === item.value}
                    onClick={() => setColor(item.value)}
                    className="size-7 rounded-full ring-offset-2 ring-offset-background transition-shadow data-[selected=true]:ring-2 data-[selected=true]:ring-ring"
                    data-selected={color === item.value}
                    style={{ backgroundColor: EVENT_COLOR_VAR[item.value] }}
                  />
                ))}
              </div>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit">Add calendar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CalendarsSidebar() {
  const { calendars, members, currentUserId, toggleCalendar } = useCalendars()
  const {
    calendarFocusDate: focusDate,
    setCalendarFocusDate: onSelectDate,
    calendarSelectedMemberIds: selectedMemberIds,
    toggleCalendarMember: onToggleMember,
  } = useWorkspaceNav()

  const myCalendars = calendars.filter(
    (calendar) => calendar.kind === "personal"
  )
  const teamCalendars = calendars.filter((calendar) => calendar.kind === "team")

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-2">
        <MiniCalendar focusDate={focusDate} onSelectDate={onSelectDate} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          <div className="flex flex-col gap-0.5">
            <SectionLabel>My calendars</SectionLabel>
            {myCalendars.map((calendar) => (
              <CalendarRow
                key={calendar.id}
                id={calendar.id}
                name={calendar.name}
                color={calendar.color}
                checked={calendar.visible}
                onToggle={() => toggleCalendar(calendar.id)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-0.5">
            <SectionLabel>Team calendars</SectionLabel>
            {teamCalendars.map((calendar) => (
              <CalendarRow
                key={calendar.id}
                id={calendar.id}
                name={calendar.name}
                color={calendar.color}
                checked={calendar.visible}
                onToggle={() => toggleCalendar(calendar.id)}
              />
            ))}
            <AddCalendarDialog />
          </div>

          <Collapsible defaultOpen>
            <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <UsersIcon className="size-3.5" />
              People
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-0.5 pt-1">
              {members
                .filter((member) => member.id !== currentUserId)
                .map((member) => {
                  const active = selectedMemberIds.includes(member.id)
                  return (
                    <label
                      key={member.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm transition-colors",
                        active ? "bg-muted/60" : "hover:bg-muted/60"
                      )}
                    >
                      <Checkbox
                        checked={active}
                        onCheckedChange={() => onToggleMember(member.id)}
                      />
                      <MemberAvatar member={member} size="sm" />
                      <span className="truncate">{member.name}</span>
                    </label>
                  )
                })}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </div>
  )
}
