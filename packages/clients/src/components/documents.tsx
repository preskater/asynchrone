"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  ImageIcon,
  PlusIcon,
  PresentationIcon,
  SearchIcon,
  UnlinkIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"

import { useClientActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type {
  ClientDocumentData,
  ClientDocumentVisibility,
  ClientFieldEntity,
  ClientFileOptionData,
} from "../types"
import { CLIENT_DOCUMENT_VISIBILITIES } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { useClientFormat } from "./use-clients"

function FileKindIcon({ kind }: { kind: string }) {
  const className = "size-4 shrink-0 text-muted-foreground"
  switch (kind) {
    case "spreadsheet":
      return <FileSpreadsheetIcon className={className} />
    case "presentation":
      return <PresentationIcon className={className} />
    case "pdf":
    case "document":
      return <FileTextIcon className={className} />
    case "image":
      return <ImageIcon className={className} />
    case "video":
      return <FileVideoIcon className={className} />
    case "audio":
      return <FileAudioIcon className={className} />
    case "archive":
      return <FileArchiveIcon className={className} />
    case "code":
      return <FileCodeIcon className={className} />
    default:
      return <FileIcon className={className} />
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ""
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/** Files linked to one client record, with visibility and unlink actions. */
export function DocumentsCard({
  entity,
  entityId,
  documents,
  canEdit,
}: {
  entity: ClientFieldEntity
  entityId: string
  documents: ClientDocumentData[]
  canEdit: boolean
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const { dateTime } = useClientFormat()
  const router = useRouter()
  const { unlinkDocumentAction, updateDocumentVisibilityAction } =
    useClientActions()

  async function handleUnlink(document: ClientDocumentData) {
    try {
      unwrapActionResult(await unlinkDocumentAction({ id: document.id }))
      toast.success(tT("documentUnlinked"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  async function handleVisibility(
    document: ClientDocumentData,
    visibility: ClientDocumentVisibility
  ) {
    try {
      unwrapActionResult(
        await updateDocumentVisibilityAction({ id: document.id, visibility })
      )
      toast.success(tT("documentVisibilityUpdated"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  const visibilityItems = CLIENT_DOCUMENT_VISIBILITIES.map((value) => ({
    value,
    label: L.clientDocumentVisibility(value),
  }))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{t("documents.title")}</CardTitle>
          {canEdit ? (
            <AddDocumentDialog
              entity={entity}
              entityId={entityId}
              linkedFileIds={documents.map((document) => document.fileId)}
              trigger={
                <Button type="button" size="sm" variant="outline">
                  <PlusIcon data-icon="inline-start" />
                  {t("documents.add")}
                </Button>
              }
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("documents.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex items-start gap-2 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <FileKindIcon kind={document.kind} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <a
                    href={`/api/files/${document.fileId}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {document.name}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {[
                      formatBytes(document.sizeBytes),
                      dateTime(document.createdAt),
                      document.addedByName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {document.trashed ? (
                  <Badge variant="outline">{t("documents.trashed")}</Badge>
                ) : null}
                {canEdit ? (
                  <Select
                    items={visibilityItems}
                    value={document.visibility}
                    onValueChange={(value) =>
                      void handleVisibility(
                        document,
                        (value ?? "internal") as ClientDocumentVisibility
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {visibilityItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary">
                    {L.clientDocumentVisibility(document.visibility)}
                  </Badge>
                )}
                {canEdit ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("documents.unlink")}
                    onClick={() => void handleUnlink(document)}
                  >
                    <UnlinkIcon className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Dialog to link one or more existing files to a client record. */
export function AddDocumentDialog({
  entity,
  entityId,
  linkedFileIds,
  trigger,
}: {
  entity: ClientFieldEntity
  entityId: string
  linkedFileIds: string[]
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const router = useRouter()
  const { fetchClientFileOptionsAction, linkDocumentAction } =
    useClientActions()

  const [open, setOpen] = React.useState(false)
  const [files, setFiles] = React.useState<ClientFileOptionData[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState<string[]>([])
  const [visibility, setVisibility] =
    React.useState<ClientDocumentVisibility>("internal")
  const [submitting, setSubmitting] = React.useState(false)

  async function loadFiles() {
    setLoading(true)
    try {
      const list = unwrapActionResult(await fetchClientFileOptionsAction())
      setFiles(list)
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setLoading(false)
    }
  }

  const available = (files ?? []).filter(
    (file) =>
      !linkedFileIds.includes(file.id) &&
      file.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (selected.length === 0) return
    setSubmitting(true)
    let linked = 0
    let failed = 0
    for (const fileId of selected) {
      try {
        unwrapActionResult(
          await linkDocumentAction({ entity, entityId, fileId, visibility })
        )
        linked += 1
      } catch (error) {
        failed += 1
        if (failed === 1 && linked === 0) {
          toast.error(te(error, "internal"))
        }
      }
    }
    if (linked > 0) toast.success(tT("documentLinked"))
    setSubmitting(false)
    if (linked > 0) {
      setOpen(false)
      router.refresh()
    }
  }

  const visibilityItems = CLIENT_DOCUMENT_VISIBILITIES.map((value) => ({
    value,
    label: L.clientDocumentVisibility(value),
  }))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setSelected([])
          setQuery("")
          setVisibility("internal")
          void loadFiles()
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("documents.add")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="client-document-search">
                {t("documents.files")}
              </FieldLabel>
              <div className="relative">
                <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="client-document-search"
                  value={query}
                  placeholder={t("documents.search")}
                  className="pl-9"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border p-3">
                {loading ? (
                  <div className="flex justify-center py-4">
                    <Spinner className="size-4" />
                  </div>
                ) : available.length === 0 ? (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    {files &&
                    files.every((file) => linkedFileIds.includes(file.id))
                      ? t("documents.allLinked")
                      : t("documents.noFiles")}
                  </p>
                ) : (
                  available.map((file) => (
                    <label
                      key={file.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={selected.includes(file.id)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked === true
                              ? [...prev, file.id]
                              : prev.filter((id) => id !== file.id)
                          )
                        }
                      />
                      <FileKindIcon kind={file.kind} />
                      <span className="truncate">{file.name}</span>
                    </label>
                  ))
                )}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="client-document-visibility">
                {t("documents.visibility")}
              </FieldLabel>
              <Select
                items={visibilityItems}
                value={visibility}
                onValueChange={(value) =>
                  setVisibility(
                    (value ?? "internal") as ClientDocumentVisibility
                  )
                }
              >
                <SelectTrigger
                  id="client-document-visibility"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {visibilityItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={submitting || selected.length === 0}
            >
              {submitting ? <Spinner className="size-4" /> : null}
              {t("documents.linkSelected", { count: selected.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
