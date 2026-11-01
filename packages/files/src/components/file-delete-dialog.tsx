"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import { useFiles } from "../store"
import type { FileNode } from "../types"

/**
 * Confirmation dialog for permanently deleting a node. Rendered outside the
 * file menus: Base UI unmounts menu content when the menu closes, which would
 * take a dialog nested inside it down with it.
 *
 * Deleting is irreversible (there are no backups), so the user must retype the
 * file name to enable the action.
 */
export function FileDeleteDialog({
  file,
  open,
  onOpenChange,
}: {
  file?: FileNode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Files")
  const { deleteForever } = useFiles()
  const [confirmName, setConfirmName] = React.useState("")

  React.useEffect(() => {
    if (!open) setConfirmName("")
  }, [open])

  const canDelete = Boolean(file) && confirmName === file?.name

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteForeverQuestion")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteForeverDescription", { name: file?.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="confirm-file-name">
            {t("typeNameToConfirm", { name: file?.name ?? "" })}
          </FieldLabel>
          <Input
            id="confirm-file-name"
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!canDelete}
            onClick={() => {
              if (canDelete && file) deleteForever(file.id)
              onOpenChange(false)
            }}
          >
            {t("deleteForever")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
