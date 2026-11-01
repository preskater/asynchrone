"use client"

import * as React from "react"
import {
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FolderInputIcon,
  LinkIcon,
  LockIcon,
  PencilIcon,
  RotateCcwIcon,
  Share2Icon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@workspace/ui/components/context-menu"

import { useFiles } from "../store"
import { useOrgSlug } from "@workspace/organization/use-org-slug"
import type { FileLocation, FileNode } from "../types"

export function FileMenuItems({
  menu,
  file,
  location,
  onPreview,
  onOpenFolder,
  onOpenShare,
  onOpenPermissions,
  onRename,
  onMove,
  onDeleteForever,
}: {
  menu: "dropdown" | "context"
  file: FileNode
  location: FileLocation
  onPreview: (file: FileNode) => void
  onOpenFolder: (file: FileNode) => void
  onOpenShare: (file: FileNode) => void
  onOpenPermissions: (file: FileNode) => void
  onRename: (file: FileNode) => void
  onMove: (file: FileNode) => void
  onDeleteForever: (file: FileNode) => void
}) {
  const t = useTranslations("Files")
  const { duplicateFile, toggleStar, trashFile, restoreFile } = useFiles()
  const orgSlug = useOrgSlug()

  const Item =
    menu === "context"
      ? (props: React.ComponentProps<typeof ContextMenuItem>) => (
          <ContextMenuItem {...props} />
        )
      : (props: React.ComponentProps<typeof DropdownMenuItem>) => (
          <DropdownMenuItem {...props} />
        )
  const Separator = menu === "context" ? ContextMenuSeparator : DropdownMenuSeparator

  const download = () => {
    window.open(`/api/files/${file.id}/download`, "_blank")
  }
  const copyLink = () => {
    void navigator.clipboard?.writeText(
      `${window.location.origin}/${orgSlug}/files`
    )
    toast.success(t("linkCopied"))
  }
  const isFolder = file.kind === "folder"

  if (location === "trash") {
    return (
      <>
        <Item onClick={() => restoreFile(file.id)}>
          <RotateCcwIcon />
          {t("restore")}
        </Item>
        <Item variant="destructive" onClick={() => onDeleteForever(file)}>
          <Trash2Icon />
          {t("deleteForever")}
        </Item>
      </>
    )
  }

  return (
    <>
      {isFolder ? (
        <Item onClick={() => onOpenFolder(file)}>
          <FolderInputIcon />
          {t("open")}
        </Item>
      ) : (
        <>
          <Item onClick={() => onPreview(file)}>
            <EyeIcon />
            {t("preview")}
          </Item>
          <Item onClick={download}>
            <DownloadIcon />
            {t("download")}
          </Item>
        </>
      )}
      <Item onClick={() => duplicateFile(file.id)}>
        <CopyIcon />
        {t("makeCopy")}
      </Item>
      <Item onClick={() => onRename(file)}>
        <PencilIcon />
        {t("rename")}
      </Item>
      <Item onClick={() => onMove(file)}>
        <FolderInputIcon />
        {t("moveTo")}
      </Item>
      <Item onClick={copyLink}>
        <LinkIcon />
        {t("copyLink")}
      </Item>
      <Item onClick={() => onOpenShare(file)}>
        <Share2Icon />
        {t("share")}
      </Item>
      <Item onClick={() => onOpenPermissions(file)}>
        <LockIcon />
        {t("managePermissions")}
      </Item>
      <Item onClick={() => toggleStar(file.id)}>
        {file.starred ? <StarOffIcon /> : <StarIcon />}
        {file.starred ? t("removeFromFavorites") : t("addToFavorites")}
      </Item>
      <Separator />
      <Item variant="destructive" onClick={() => trashFile(file.id)}>
        <Trash2Icon />
        {t("moveToTrash")}
      </Item>
    </>
  )
}
