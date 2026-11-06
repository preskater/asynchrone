"use client"

import * as React from "react"
import {
  ArrowDownUpIcon,
  FolderPlusIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
  UploadIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { FolderDialog } from "./folder-dialog"
import { FileUploadDialog } from "./file-upload-dialog"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"

import type { FileLocation, FileNode } from "../types"

export type SortOption = "name" | "owner" | "modifiedAt" | "sizeBytes"
export type ViewMode = "list" | "grid"

const SORT_OPTIONS = ["name", "modifiedAt", "sizeBytes"] as const

const FILTER_OPTIONS = ["all", "folder", "document", "image", "spreadsheet"] as const
type FilterOption = (typeof FILTER_OPTIONS)[number]

export function FilesToolbar({
  breadcrumb,
  query,
  onQueryChange,
  view,
  onViewChange,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  onNavigateRoot,
  onNavigateFolder,
  folderId,
  onSearch,
}: {
  breadcrumb: FileNode[]
  query: string
  onQueryChange: (value: string) => void
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  sort: SortOption
  onSortChange: (sort: SortOption) => void
  filter: string
  onFilterChange: (filter: string) => void
  onNavigateRoot: () => void
  onNavigateFolder: (folderId: string) => void
  folderId: string | null
  onSearch: () => void
}) {
  const t = useTranslations("Files")

  const sortLabels: Record<SortOption, string> = {
    name: t("name"),
    owner: t("owner"),
    modifiedAt: t("lastModified"),
    sizeBytes: t("size"),
  }
  const filterLabels: Record<FilterOption, string> = {
    all: t("allTypes"),
    folder: t("folders"),
    document: t("documents"),
    image: t("images"),
    spreadsheet: t("spreadsheets"),
  }
  const filterItems = FILTER_OPTIONS.map((value) => ({
    value,
    label: filterLabels[value],
  }))

  const sortLabel = sortLabels[sort] ?? t("name")

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {breadcrumb.length === 0 ? (
              <BreadcrumbPage>{t("myFiles")}</BreadcrumbPage>
            ) : (
              <button
                type="button"
                onClick={onNavigateRoot}
                className="transition-colors hover:text-foreground"
              >
                {t("myFiles")}
              </button>
            )}
          </BreadcrumbItem>
          {breadcrumb.map((folder, index) => {
            const last = index === breadcrumb.length - 1
            return (
              <React.Fragment key={folder.id}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {last ? (
                    <BreadcrumbPage>{folder.name}</BreadcrumbPage>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigateFolder(folder.id)}
                      className="transition-colors hover:text-foreground"
                    >
                      {folder.name}
                    </button>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-56">
          <InputGroupInput
            placeholder={t("searchFiles")}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearch()
            }}
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>

        <Select
          items={filterItems}
          value={filter}
          onValueChange={(value) => onFilterChange(value as string)}
        >
          <SelectTrigger
            aria-label={t("filterFiles")}
            className="hidden w-40 md:flex"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {FILTER_OPTIONS.map((item) => (
                <SelectItem key={item} value={item}>
                  {filterLabels[item]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" />}
          >
            <ArrowDownUpIcon data-icon="inline-start" />
            {sortLabel}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {SORT_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => onSortChange(option)}
                >
                  {sortLabels[option]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <ToggleGroup
          value={[view]}
          onValueChange={(value) => value[0] && onViewChange(value[0] as ViewMode)}
          spacing={0}
          className="hidden sm:flex"
        >
          <ToggleGroupItem value="list" variant="outline" size="sm" aria-label={t("listView")}>
            <ListIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" variant="outline" size="sm" aria-label={t("gridView")}>
            <LayoutGridIcon />
          </ToggleGroupItem>
        </ToggleGroup>

        <FolderDialog parentId={folderId}>
          <Button variant="outline" size="sm" aria-label={t("newFolder")}>
            <FolderPlusIcon data-icon="inline-start" />
            <span className="hidden sm:inline">{t("newFolder")}</span>
          </Button>
        </FolderDialog>

        <FileUploadDialog parentId={folderId}>
          <Button size="sm">
            <UploadIcon data-icon="inline-start" />
            {t("upload")}
          </Button>
        </FileUploadDialog>
      </div>
    </div>
  )
}
