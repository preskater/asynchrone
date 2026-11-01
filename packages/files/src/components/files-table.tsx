"use client"

import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  EllipsisIcon,
  LockIcon,
  Share2Icon,
  StarIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { FileIcon } from "./file-icon"
import { FileMenuItems } from "./file-actions"
import { MemberAvatar } from "./member-avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import { formatBytes, formatRelativeDate } from "../file-utils"
import { useFiles } from "../store"
import type { FileLocation, FileNode } from "../types"
import type { SortOption } from "./files-toolbar"

type SortDir = "asc" | "desc"

const PAGE_SIZE = 8

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string
  sortKey: SortOption
  activeKey: SortOption
  dir: SortDir
  onSort: (key: SortOption) => void
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

export function FilesTable({
  files,
  location,
  selected,
  onSelectedChange,
  onOpenFolder,
  onPreview,
  onOpenShare,
  onOpenPermissions,
  onRename,
  onMove,
  onDeleteForever,
  sortKey,
  sortDir,
  onSortChange,
}: {
  files: FileNode[]
  location: FileLocation
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  onOpenFolder: (file: FileNode) => void
  onPreview: (file: FileNode) => void
  onOpenShare: (file: FileNode) => void
  onOpenPermissions: (file: FileNode) => void
  onRename: (file: FileNode) => void
  onMove: (file: FileNode) => void
  onDeleteForever: (file: FileNode) => void
  sortKey: SortOption
  sortDir: SortDir
  onSortChange: (key: SortOption) => void
}) {
  const { getMember } = useFiles()
  const t = useTranslations("Files")
  const tc = useTranslations("Common")
  const locale = useLocale()
  const [page, setPage] = React.useState(1)

  React.useEffect(() => {
    setPage(1)
  }, [files.length, location])

  const pageCount = Math.max(1, Math.ceil(files.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageFiles = files.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const allSelected =
    pageFiles.length > 0 &&
    pageFiles.every((file) => selected.includes(file.id))

  const dir = sortDir

  function toggleOne(file: FileNode) {
    onSelectedChange(
      selected.includes(file.id)
        ? selected.filter((id) => id !== file.id)
        : [...selected, file.id]
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label={t("selectAll")}
                  checked={allSelected}
                  onCheckedChange={(checked) =>
                    onSelectedChange(
                      checked === true
                        ? Array.from(
                            new Set([
                              ...selected,
                              ...pageFiles.map((f) => f.id),
                            ])
                          )
                        : selected.filter(
                            (id) => !pageFiles.some((f) => f.id === id)
                          )
                    )
                  }
                />
              </TableHead>
              <SortHeader
                label={t("name")}
                sortKey="name"
                activeKey={sortKey}
                dir={dir}
                onSort={onSortChange}
              />
              <SortHeader
                label={t("owner")}
                sortKey="owner"
                activeKey={sortKey}
                dir={dir}
                onSort={onSortChange}
                className="hidden md:table-cell"
              />
              <SortHeader
                label={t("modified")}
                sortKey="modifiedAt"
                activeKey={sortKey}
                dir={dir}
                onSort={onSortChange}
                className="hidden sm:table-cell"
              />
              <SortHeader
                label={t("size")}
                sortKey="sizeBytes"
                activeKey={sortKey}
                dir={dir}
                onSort={onSortChange}
                className="hidden lg:table-cell"
              />
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageFiles.map((file) => {
              const owner = getMember(file.ownerId)
              return (
                <ContextMenu key={file.id}>
                  <ContextMenuTrigger
                    render={
                      <TableRow
                        data-state={
                          selected.includes(file.id) ? "selected" : undefined
                        }
                        className="cursor-pointer"
                        onClick={() =>
                          file.kind === "folder"
                            ? onOpenFolder(file)
                            : onPreview(file)
                        }
                      />
                    }
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={t("selectFile", { name: file.name })}
                        checked={selected.includes(file.id)}
                        onCheckedChange={() => toggleOne(file)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileIcon kind={file.kind} />
                        <span className="truncate font-medium">
                          {file.name}
                        </span>
                        {file.starred ? (
                          <StarIcon className="size-3.5 shrink-0 fill-[color:var(--chart-4)] text-[color:var(--chart-4)]" />
                        ) : null}
                        {file.shared ? (
                          <Badge variant="outline" className="shrink-0">
                            <Share2Icon />
                            {t("shared")}
                          </Badge>
                        ) : null}
                        {file.restricted ? (
                          <Badge variant="secondary" className="shrink-0">
                            <LockIcon />
                            {t("restricted")}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <MemberAvatar member={owner} size="sm" />
                        <span className="text-sm text-muted-foreground">
                          {owner?.name ?? t("unknown")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {formatRelativeDate(file.modifiedAt, locale, tc)}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground tabular-nums lg:table-cell">
                      {file.kind === "folder"
                        ? "—"
                        : formatBytes(file.sizeBytes)}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("fileActions")}
                            />
                          }
                        >
                          <EllipsisIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <FileMenuItems
                              menu="dropdown"
                              file={file}
                              location={location}
                              onPreview={onPreview}
                              onOpenFolder={onOpenFolder}
                              onOpenShare={onOpenShare}
                              onOpenPermissions={onOpenPermissions}
                              onRename={onRename}
                              onMove={onMove}
                              onDeleteForever={onDeleteForever}
                            />
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuGroup>
                      <FileMenuItems
                        menu="context"
                        file={file}
                        location={location}
                        onPreview={onPreview}
                        onOpenFolder={onOpenFolder}
                        onOpenShare={onOpenShare}
                        onOpenPermissions={onOpenPermissions}
                        onRename={onRename}
                        onMove={onMove}
                        onDeleteForever={onDeleteForever}
                      />
                    </ContextMenuGroup>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{t("itemCount", { count: files.length })}</span>
        {pageCount > 1 ? (
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  aria-disabled={currentPage === 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                />
              </PaginationItem>
              {Array.from({ length: pageCount }).map((_, index) => (
                <PaginationItem key={index}>
                  <PaginationLink
                    isActive={index + 1 === currentPage}
                    onClick={() => setPage(index + 1)}
                  >
                    {index + 1}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  aria-disabled={currentPage === pageCount}
                  onClick={() =>
                    setPage((prev) => Math.min(pageCount, prev + 1))
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </div>
    </div>
  )
}
