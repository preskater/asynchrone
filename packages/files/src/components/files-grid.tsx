"use client"

import * as React from "react"
import { EllipsisIcon, LockIcon, Share2Icon, StarIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { FileIcon } from "./file-icon"
import { FileMenuItems } from "./file-actions"
import { Button } from "@workspace/ui/components/button"
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

import { formatBytes, formatRelativeDate } from "../file-utils"
import { useFiles } from "../store"
import type { FileLocation, FileNode } from "../types"

export function FilesGrid({
  files,
  location,
  onOpenFolder,
  onPreview,
  onOpenShare,
  onOpenPermissions,
  onRename,
  onMove,
  onDeleteForever,
}: {
  files: FileNode[]
  location: FileLocation
  onOpenFolder: (file: FileNode) => void
  onPreview: (file: FileNode) => void
  onOpenShare: (file: FileNode) => void
  onOpenPermissions: (file: FileNode) => void
  onRename: (file: FileNode) => void
  onMove: (file: FileNode) => void
  onDeleteForever: (file: FileNode) => void
}) {
  const { getMember } = useFiles()
  const t = useTranslations("Files")
  const tc = useTranslations("Common")
  const locale = useLocale()

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {files.map((file) => {
        const owner = getMember(file.ownerId)
        return (
          <ContextMenu key={file.id}>
            <ContextMenuTrigger
              render={
                <button
                  type="button"
                  data-fx-card
                  onClick={() =>
                    file.kind === "folder"
                      ? onOpenFolder(file)
                      : onPreview(file)
                  }
                  className="group/card flex flex-col gap-3 rounded-xl bg-card p-3 text-start ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25"
                />
              }
            >
              <div className="relative flex aspect-video w-full items-center justify-center rounded-lg bg-muted/40">
                <FileIcon kind={file.kind} className="size-10" />
                {file.starred ? (
                  <StarIcon className="absolute end-2 top-2 size-3.5 fill-[color:var(--chart-4)] text-[color:var(--chart-4)]" />
                ) : null}
                <div
                  className="absolute end-1.5 top-1.5 opacity-0 transition-opacity group-hover/card:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("fileActions")}
                          className="bg-background/80"
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
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="truncate text-sm font-medium">
                  {file.name}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{formatRelativeDate(file.modifiedAt, locale, tc)}</span>
                  {file.kind !== "folder" ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{formatBytes(file.sizeBytes)}</span>
                    </>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    {owner?.name}
                  </span>
                  {file.shared ? (
                    <Share2Icon className="size-3 shrink-0 text-muted-foreground" />
                  ) : null}
                  {file.restricted ? (
                    <LockIcon className="size-3 shrink-0 text-muted-foreground" />
                  ) : null}
                </div>
              </div>
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
    </div>
  )
}
