"use client"

import * as React from "react"
import { FolderIcon, HomeIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

import { useFiles } from "../store"
import type { FileNode } from "../types"

export function FileMoveDialog({
  file,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  file: FileNode
  children?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { files, moveFile } = useFiles()
  const t = useTranslations("Files")
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [target, setTarget] = React.useState<string | null>(file.parentId)

  const folders = files.filter(
    (node) => node.kind === "folder" && !node.trashed && node.id !== file.id
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setTarget(file.parentId)
      }}
    >
      {children ? <DialogTrigger render={children} /> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("moveTitle", { name: file.name })}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-72 rounded-lg border p-1">
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setTarget(null)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors",
                target === null ? "bg-muted" : "hover:bg-muted/60"
              )}
            >
              <HomeIcon className="size-4 text-muted-foreground" />
              {t("myFiles")}
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => setTarget(folder.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors",
                  target === folder.id ? "bg-muted" : "hover:bg-muted/60"
                )}
              >
                <FolderIcon className="size-4 text-[color:var(--chart-4)]" />
                {folder.name}
              </button>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            {t("cancel")}
          </DialogClose>
          <Button
            type="button"
            onClick={() => {
              moveFile(file.id, target)
              setOpen(false)
            }}
          >
            {t("moveHere")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
