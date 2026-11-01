"use client"

import * as React from "react"
import { FolderIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

import { FilesGrid } from "./files-grid"
import { FilesSearchCommand } from "./files-search-command"
import { FilesTable } from "./files-table"
import {
  FilesToolbar,
  type SortOption,
  type ViewMode,
} from "./files-toolbar"
import { FileDeleteDialog } from "./file-delete-dialog"
import { FileMoveDialog } from "./file-move-dialog"
import { FilePermissionsSheet } from "./file-permissions-sheet"
import { FilePreviewSheet } from "./file-preview-sheet"
import { FileRenameDialog } from "./file-rename-dialog"
import { FileShareDialog } from "./file-share-dialog"
import { UploadQueue } from "./file-upload-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

import { useFiles, useFilesNav } from "../store"
import { useRecents } from "@workspace/app-shell/recents"
import { useEnumLabel } from "@workspace/i18n/labels"
import type { FileLocation, FileNode } from "../types"

export function FilesWorkspace() {
  const t = useTranslations("Files")
  const L = useEnumLabel()
  const {
    breadcrumbFor,
    childrenOf,
    getFile,
    getMember,
    moveToTrashMany,
    restoreMany,
    deleteMany,
    uploads,
    ensureFilesLoaded,
  } = useFiles()
  const { record, active, hydrated } = useRecents()
  const {
    location,
    folderId,
    selectLocation: selectFileLocation,
    openFolder: openFileFolder,
  } = useFilesNav()

  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState("all")
  const [sortKey, setSortKey] = React.useState<SortOption>("name")
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc")
  const [view, setView] = React.useState<ViewMode>("list")
  const [selected, setSelected] = React.useState<string[]>([])
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [previewFile, setPreviewFile] = React.useState<FileNode | undefined>()
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [shareFile, setShareFile] = React.useState<FileNode | undefined>()
  const [shareOpen, setShareOpen] = React.useState(false)
  const [permissionsFile, setPermissionsFile] = React.useState<
    FileNode | undefined
  >()
  const [permissionsOpen, setPermissionsOpen] = React.useState(false)
  const [renameTarget, setRenameTarget] = React.useState<FileNode | undefined>()
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [moveTarget, setMoveTarget] = React.useState<FileNode | undefined>()
  const [moveOpen, setMoveOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<FileNode | undefined>()

  React.useEffect(() => {
    ensureFilesLoaded()
  }, [ensureFilesLoaded])

  const restored = React.useRef(false)
  React.useEffect(() => {
    if (!hydrated || restored.current || !active.files) return
    restored.current = true
    const entry = active.files.replace(/^files:/, "")
    const [entryLocation, entryFolder] = entry.split(":") as [
      FileLocation,
      string,
    ]
    if (!entryLocation) return
    const folder = entryFolder && entryFolder !== "root" ? entryFolder : null
    if (folder && getFile(folder)?.kind === "folder") {
      openFileFolder(folder)
    } else {
      selectFileLocation(entryLocation)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, active.files, getFile])

  React.useEffect(() => {
    setSelected([])
  }, [folderId])

  React.useEffect(() => {
    setSelected([])
    setQuery("")
  }, [location])

  const recordedRef = React.useRef(false)
  React.useEffect(() => {
    if (!hydrated) return
    if (!recordedRef.current && active.files) {
      recordedRef.current = true
      return
    }
    recordedRef.current = true
    const entryId = `files:${location}:${folderId ?? "root"}`
    const folder = folderId ? getFile(folderId) : undefined
    record("files", {
      id: entryId,
      label: folder?.name ?? L.fileLocation(location),
      hint: folder ? L.fileLocation(location) : t("location"),
      data: { location, folderId },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, folderId, hydrated])

  const breadcrumb = location === "my-files" ? breadcrumbFor(folderId) : []
  const filtered = React.useMemo(() => {
    const list = childrenOf(location, folderId, query)
    return filter === "all" ? list : list.filter((file) => file.kind === filter)
  }, [childrenOf, location, folderId, query, filter])

  const sorted = React.useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      if (a.kind === "folder" && b.kind !== "folder") return -1
      if (b.kind === "folder" && a.kind !== "folder") return 1
      const modifier = sortDir === "asc" ? 1 : -1
      if (sortKey === "name") return a.name.localeCompare(b.name) * modifier
      if (sortKey === "owner") {
        const aName = getMember(a.ownerId)?.name ?? ""
        const bName = getMember(b.ownerId)?.name ?? ""
        return aName.localeCompare(bName) * modifier
      }
      if (sortKey === "modifiedAt")
        return (
          (new Date(a.modifiedAt).getTime() -
            new Date(b.modifiedAt).getTime()) *
          modifier
        )
      return ((a.sizeBytes ?? 0) - (b.sizeBytes ?? 0)) * modifier
    })
    return copy
  }, [filtered, sortKey, sortDir, getMember])

  function changeSort(key: SortOption) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  function openFolder(file: FileNode) {
    openFileFolder(file.id)
  }

  function openPreview(file: FileNode) {
    setPreviewFile(file)
    setPreviewOpen(true)
  }

  function openShare(file: FileNode) {
    setShareFile(file)
    setShareOpen(true)
  }

  function openPermissions(file: FileNode) {
    setPermissionsFile(file)
    setPermissionsOpen(true)
  }

  function openRename(file: FileNode) {
    setRenameTarget(file)
    setRenameOpen(true)
  }

  function openMove(file: FileNode) {
    setMoveTarget(file)
    setMoveOpen(true)
  }

  function openFile(file: FileNode) {
    if (file.kind === "folder") {
      openFolder(file)
    } else {
      openFileFolder(file.parentId)
      openPreview(file)
    }
  }

  const isTrash = location === "trash"

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <div className="flex min-h-0 flex-1 flex-col">
          <FilesToolbar
            breadcrumb={breadcrumb}
            query={query}
            onQueryChange={setQuery}
            view={view}
            onViewChange={setView}
            sort={sortKey}
            onSortChange={changeSort}
            filter={filter}
            onFilterChange={setFilter}
            onNavigateRoot={() => openFileFolder(null)}
            onNavigateFolder={openFileFolder}
            folderId={folderId}
            onSearch={() => setSearchOpen(true)}
          />

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {uploads.length > 0 ? <UploadQueue /> : null}

            {selected.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <span className="text-sm font-medium">
                  {t("selectedCount", { count: selected.length })}
                </span>
                <div className="ms-auto flex items-center gap-2">
                  {isTrash ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          restoreMany(selected)
                          setSelected([])
                        }}
                      >
                        <RotateCcwIcon data-icon="inline-start" />
                        {t("restore")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          deleteMany(selected)
                          setSelected([])
                        }}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        {t("deleteForever")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        moveToTrashMany(selected)
                        setSelected([])
                      }}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      {t("moveToTrash")}
                    </Button>
                  )}
                </div>
              </div>
            ) : null}

            {sorted.length === 0 ? (
              <Empty className="flex-1 border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FolderIcon />
                  </EmptyMedia>
                  <EmptyTitle>
                    {isTrash
                      ? t("trashEmpty")
                      : t("noFilesIn", { location: L.fileLocation(location) })}
                  </EmptyTitle>
                  <EmptyDescription>
                    {isTrash ? t("deletedHere") : t("getStarted")}
                  </EmptyDescription>
                </EmptyHeader>
                {!isTrash ? (
                  <EmptyContent>
                    <Badge variant="outline">{t("searchTip")}</Badge>
                  </EmptyContent>
                ) : null}
              </Empty>
            ) : view === "list" ? (
              <FilesTable
                files={sorted}
                location={location}
                selected={selected}
                onSelectedChange={setSelected}
                onOpenFolder={openFolder}
                onPreview={openPreview}
                onOpenShare={openShare}
                onOpenPermissions={openPermissions}
                onRename={openRename}
                onMove={openMove}
                onDeleteForever={setDeleteTarget}
                sortKey={sortKey}
                sortDir={sortDir}
                onSortChange={changeSort}
              />
            ) : (
              <FilesGrid
                files={sorted}
                location={location}
                onOpenFolder={openFolder}
                onPreview={openPreview}
                onOpenShare={openShare}
                onOpenPermissions={openPermissions}
                onRename={openRename}
                onMove={openMove}
                onDeleteForever={setDeleteTarget}
              />
            )}
          </div>
        </div>
      </div>

      <FilePreviewSheet
        file={previewFile}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onOpenShare={openShare}
        onOpenPermissions={openPermissions}
      />

      {shareFile ? (
        <FileShareDialog
          file={shareFile}
          open={shareOpen}
          onOpenChange={setShareOpen}
          children={<span className="hidden" />}
        />
      ) : null}

      <FilePermissionsSheet
        file={permissionsFile}
        open={permissionsOpen}
        onOpenChange={setPermissionsOpen}
      />

      {renameTarget ? (
        <FileRenameDialog
          file={renameTarget}
          open={renameOpen}
          onOpenChange={setRenameOpen}
        />
      ) : null}

      {moveTarget ? (
        <FileMoveDialog
          file={moveTarget}
          open={moveOpen}
          onOpenChange={setMoveOpen}
        />
      ) : null}

      <FileDeleteDialog
        file={deleteTarget}
        open={deleteTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined)
        }}
      />

      <FilesSearchCommand
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectFile={openFile}
      />
    </>
  )
}
