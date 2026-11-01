"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { EventDialog } from "@/components/calendars/event-dialog"
import { MeetingRequestsDialog } from "@/components/meetings/meeting-requests-dialog"
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@workspace/ui/components/button-group"
import { Button } from "@workspace/ui/components/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Toggle } from "@workspace/ui/components/toggle"
import {
  CheckSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"

import type { CalendarView } from "@workspace/calendars/types"

const VIEWS: CalendarView[] = ["day", "week", "month", "agenda", "availability"]

export function CalendarsHeader({
  rangeLabel,
  view,
  onViewChange,
  onToday,
  onPrev,
  onNext,
  onSearch,
  showTasks,
  onToggleTasks,
}: {
  rangeLabel: string
  view: CalendarView
  onViewChange: (view: CalendarView) => void
  onToday: () => void
  onPrev: () => void
  onNext: () => void
  onSearch: () => void
  showTasks: boolean
  onToggleTasks: () => void
}) {
  const t = useTranslations("Calendars")
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex items-center gap-3">
        <h2 className="min-w-(--range-width,12rem) text-base font-semibold">
          {rangeLabel}
        </h2>
        <ButtonGroup>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("previous")}
            onClick={onPrev}
          >
            <ChevronLeftIcon />
          </Button>
          <ButtonGroupSeparator />
          <Button variant="outline" size="sm" onClick={onToday}>
            {t("today")}
          </Button>
          <ButtonGroupSeparator />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("next")}
            onClick={onNext}
          >
            <ChevronRightIcon />
          </Button>
        </ButtonGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={view}
          onValueChange={(next) => onViewChange(next as CalendarView)}
          className="hidden sm:block"
        >
          <TabsList>
            {VIEWS.map((item) => (
              <TabsTrigger key={item} value={item}>
                {t(item)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <InputGroup className="hidden w-52 md:flex">
          <InputGroupInput
            placeholder={t("searchEventsPlaceholder")}
            readOnly
            onClick={onSearch}
            onFocus={onSearch}
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("searchLabel")}
          onClick={onSearch}
          className="md:hidden"
        >
          <SearchIcon />
        </Button>

        <Toggle
          variant="outline"
          size="sm"
          pressed={showTasks}
          onPressedChange={onToggleTasks}
          aria-label={t("showTasks")}
        >
          <CheckSquareIcon data-icon="inline-start" />
          {t("showTasks")}
        </Toggle>

        <MeetingRequestsDialog />

        <EventDialog
          trigger={
            <Button>
              <PlusIcon data-icon="inline-start" />
              {t("newEvent")}
            </Button>
          }
        />
      </div>
    </header>
  )
}

export { VIEWS }
