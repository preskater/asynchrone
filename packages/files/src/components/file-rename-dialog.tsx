"use client"

import * as React from "react"
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
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import { useFiles } from "../store"
import type { FileNode } from "../types"

export function FileRenameDialog({
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
  const { renameFile } = useFiles()
  const t = useTranslations("Files")
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [name, setName] = React.useState(file.name)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setName(file.name)
      }}
    >
      {children ? <DialogTrigger render={children} /> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {file.kind === "folder" ? t("renameFolder") : t("renameFile")}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            renameFile(file.id, name)
            setOpen(false)
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`rename-${file.id}`}>{t("name")}</FieldLabel>
              <Input
                id={`rename-${file.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit">{t("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
