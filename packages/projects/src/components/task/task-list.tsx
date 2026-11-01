"use client"

import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { MemberAvatar } from "./member-avatar"
import { PriorityBadge, StatusBadge } from "./task-badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import { useProjectStore } from "../../ui/store"
import { formatDate, type Task } from "../../types"

type SortKey = "title" | "status" | "priority" | "dueDate"
type SortDir = "asc" | "desc"

const PAGE_SIZES = [5, 10, 20]

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = activeKey === sortKey
  const Icon = !active
    ? ChevronsUpDownIcon
    : dir === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
  return (
    <TableHead className={cn(className)}>
      <Button
        variant="ghost"
        size="sm"
        className="-ms-2 h-7"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon data-icon="inline-end" />
      </Button>
    </TableHead>
  )
}

export function TaskList({
  tasks,
  onOpen,
}: {
  tasks: Task[]
  onOpen: (taskId: string) => void
}) {
  const t = useTranslations("Projects")
  const locale = useLocale()
  const { getMember } = useProjectStore()
  const [sortKey, setSortKey] = React.useState<SortKey>("dueDate")
  const [dir, setDir] = React.useState<SortDir>("asc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [selected, setSelected] = React.useState<Record<string, boolean>>({})

  const sorted = React.useMemo(() => {
    const copy = [...tasks]
    copy.sort((a, b) => {
      const modifier = dir === "asc" ? 1 : -1
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title) * modifier
        case "status":
          return a.status.localeCompare(b.status) * modifier
        case "priority":
          return a.priority.localeCompare(b.priority) * modifier
        case "dueDate": {
          const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
          const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
          return (aTime - bTime) * modifier
        }
      }
    })
    return copy
  }, [tasks, sortKey, dir])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageTasks = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setDir((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setDir("asc")
    }
  }

  const allSelectedOnPage =
    pageTasks.length > 0 && pageTasks.every((task) => selected[task.id])

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label={t("selectAll")}
                  checked={allSelectedOnPage}
                  onCheckedChange={(checked) => {
                    setSelected((prev) => {
                      const next = { ...prev }
                      pageTasks.forEach((task) => {
                        next[task.id] = checked === true
                      })
                      return next
                    })
                  }}
                />
              </TableHead>
              <SortHeader
                label={t("task")}
                sortKey="title"
                activeKey={sortKey}
                dir={dir}
                onSort={handleSort}
              />
              <SortHeader
                label={t("status")}
                sortKey="status"
                activeKey={sortKey}
                dir={dir}
                onSort={handleSort}
                className="hidden md:table-cell"
              />
              <SortHeader
                label={t("priority")}
                sortKey="priority"
                activeKey={sortKey}
                dir={dir}
                onSort={handleSort}
                className="hidden sm:table-cell"
              />
              <TableHead className="hidden lg:table-cell">
                {t("assignee")}
              </TableHead>
              <SortHeader
                label={t("dueDate")}
                sortKey="dueDate"
                activeKey={sortKey}
                dir={dir}
                onSort={handleSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageTasks.map((task) => {
              const assignee = getMember(task.assigneeId)
              return (
                <TableRow
                  key={task.id}
                  data-state={selected[task.id] ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => onOpen(task.id)}
                >
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      aria-label={t("selectTask", {
                        identifier: task.identifier,
                      })}
                      checked={selected[task.id] ?? false}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => ({
                          ...prev,
                          [task.id]: checked === true,
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">
                        {task.identifier}
                      </span>
                      <span className="font-medium">{task.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StatusBadge status={task.status} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <PriorityBadge priority={task.priority} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {assignee ? (
                      <div className="flex items-center gap-2">
                        <MemberAvatar member={assignee} size="sm" />
                        <span className="text-sm">{assignee.name}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {t("unassigned")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(task.dueDate, locale) ?? t("dash")}
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t("taskCount", { count: sorted.length })}</span>
          <span aria-hidden>·</span>
          <div className="flex items-center gap-2">
            <span>{t("rowsPerPage")}</span>
            <Select
              items={PAGE_SIZES.map((size) => ({
                label: String(size),
                value: String(size),
              }))}
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value))
                setPage(1)
              }}
            >
              <SelectTrigger size="sm" className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={currentPage === 1}
                onClick={() =>
                  setPage((prev) => Math.max(1, Math.min(prev, pageCount) - 1))
                }
              />
            </PaginationItem>
            {Array.from({ length: pageCount }).map((_, index) => {
              const number = index + 1
              if (
                pageCount > 6 &&
                number !== 1 &&
                number !== pageCount &&
                Math.abs(number - currentPage) > 1
              ) {
                if (number === 2 || number === pageCount - 1) {
                  return (
                    <PaginationItem key={number}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )
                }
                return null
              }
              return (
                <PaginationItem key={number}>
                  <PaginationLink
                    isActive={number === currentPage}
                    onClick={() => setPage(number)}
                  >
                    {number}
                  </PaginationLink>
                </PaginationItem>
              )
            })}
            <PaginationItem>
              <PaginationNext
                aria-disabled={currentPage === pageCount}
                onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}
