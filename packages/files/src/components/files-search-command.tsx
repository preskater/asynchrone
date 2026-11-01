"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"

import { FileIcon } from "./file-icon"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"

import { formatBytes, formatRelativeDate } from "../file-utils"
import { useFiles } from "../store"
import type { FileNode } from "../types"

export function FilesSearchCommand({
  open,
  onOpenChange,
  onSelectFile,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectFile: (file: FileNode) => void
}) {
  const { files, getMember } = useFiles()
  const t = useTranslations("Files")
  const tc = useTranslations("Common")
  const locale = useLocale()
  const visible = files.filter((file) => !file.trashed)

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("searchFilesTitle")}
      description={t("searchAcrossFiles")}
      className="sm:max-w-lg"
    >
      <Command
        filter={(value, search) =>
          value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
        }
      >
        <CommandInput placeholder={t("searchFiles")} />
        <CommandList>
          <CommandEmpty>{t("noFilesFound")}</CommandEmpty>
          <CommandGroup heading={t("files")}>
            {visible.map((file) => {
              const owner = getMember(file.ownerId)
              return (
                <CommandItem
                  key={file.id}
                  value={`${file.name} ${owner?.name ?? ""}`}
                  onSelect={() => {
                    onSelectFile(file)
                    onOpenChange(false)
                  }}
                >
                  <FileIcon kind={file.kind} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{file.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {owner?.name} · {formatRelativeDate(file.modifiedAt, locale, tc)}
                      {file.kind === "folder" ? "" : ` · ${formatBytes(file.sizeBytes)}`}
                    </span>
                  </span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
