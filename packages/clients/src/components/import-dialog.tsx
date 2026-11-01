"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { useClientActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type { ClientImportResultData } from "../types"
import { CLIENT_STATUSES } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"

type ImportKind = "clients" | "contacts"

interface ParsedRow {
  name?: string
  status?: string
  industry?: string
  website?: string
  phone?: string
  address?: string
  contactEmail?: string
  description?: string
  source?: string
  firstName?: string
  lastName?: string
  email?: string
  jobTitle?: string
  company?: string
}

/** Minimal CSV parser (handles quotes, ; and , separators). */
function parseCsv(raw: string): string[][] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return []
  const delimiter =
    (lines[0]!.match(/;/g)?.length ?? 0) >= (lines[0]!.match(/,/g)?.length ?? 0)
      ? ";"
      : ","
  const rows: string[][] = []
  for (const line of lines) {
    const cells: string[] = []
    let current = ""
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      if (quoted) {
        if (char === '"') {
          if (line[index + 1] === '"') {
            current += '"'
            index += 1
          } else {
            quoted = false
          }
        } else {
          current += char
        }
      } else if (char === '"') {
        quoted = true
      } else if (char === delimiter) {
        cells.push(current.trim())
        current = ""
      } else {
        current += char
      }
    }
    cells.push(current.trim())
    rows.push(cells)
  }
  return rows
}

function toRows(kind: ImportKind, cells: string[][]): ParsedRow[] {
  const [, ...data] = cells
  return data
    .filter((cells) => cells.some((cell) => cell !== ""))
    .map((cells): ParsedRow => {
      const [
        c0 = "",
        c1 = "",
        c2 = "",
        c3 = "",
        c4 = "",
        c5 = "",
        c6 = "",
        c7 = "",
        c8 = "",
      ] = cells
      if (kind === "clients") {
        return {
          name: c0,
          status: c1,
          industry: c2,
          website: c3,
          phone: c4,
          address: c5,
          contactEmail: c6,
          description: c7,
          source: c8,
        }
      }
      return {
        firstName: c0,
        lastName: c1,
        email: c2,
        phone: c3,
        jobTitle: c4,
        company: c5,
      }
    })
    .filter((row) =>
      kind === "clients" ? Boolean(row.name) : Boolean(row.firstName)
    )
}

export function ImportDialog({
  kind,
  trigger,
}: {
  kind: ImportKind
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const router = useRouter()
  const { importClientsAction, importContactsAction } = useClientActions()

  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const [rows, setRows] = React.useState<ParsedRow[] | null>(null)
  const [parseError, setParseError] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<ClientImportResultData | null>(
    null
  )

  function reset() {
    setText("")
    setRows(null)
    setParseError(false)
    setResult(null)
  }

  function handleParse(value: string) {
    setText(value)
    setResult(null)
    if (value.trim() === "") {
      setRows(null)
      setParseError(false)
      return
    }
    const parsed = toRows(kind, parseCsv(value))
    setRows(parsed)
    setParseError(false)
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const content = await file.text()
      handleParse(content)
    } catch {
      setParseError(true)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!rows || rows.length === 0) return
    setImporting(true)
    try {
      const payload =
        kind === "clients"
          ? rows.map((row) => ({
              name: row.name ?? "",
              status: (CLIENT_STATUSES as readonly string[]).includes(
                row.status ?? ""
              )
                ? (row.status as (typeof CLIENT_STATUSES)[number])
                : undefined,
              industry: row.industry || undefined,
              website: row.website || undefined,
              phone: row.phone || undefined,
              address: row.address || undefined,
              contactEmail: row.contactEmail || undefined,
              description: row.description || undefined,
              source: row.source || undefined,
            }))
          : rows.map((row) => ({
              firstName: row.firstName ?? "",
              lastName: row.lastName || undefined,
              email: row.email || undefined,
              phone: row.phone || undefined,
              jobTitle: row.jobTitle || undefined,
              company: row.company || undefined,
            }))
      const response = unwrapActionResult(
        kind === "clients"
          ? await importClientsAction({ rows: payload })
          : await importContactsAction({ rows: payload })
      )
      setResult(response)
      toast.success(tT("importDone"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("import.title", {
              entity: t(
                `fields.entities.${kind === "clients" ? "client" : "contact"}`
              ),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("import.description")}{" "}
            {kind === "clients"
              ? t("import.clientsHint")
              : t("import.contactsHint")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void handleFile(event)}
          />
          <Textarea
            value={text}
            rows={8}
            placeholder={t("import.paste")}
            onChange={(event) => handleParse(event.target.value)}
          />
          {parseError ? (
            <p className="text-sm text-destructive">{t("import.invalid")}</p>
          ) : rows && rows.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {t("import.rowsDetected", { count: rows.length })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("import.duplicatesHint")}
              </p>
            </div>
          ) : null}
          {result ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">
                {t("import.result.created", { count: result.created })}
              </Badge>
              {result.restored > 0 ? (
                <Badge variant="secondary">
                  {t("import.result.restored", { count: result.restored })}
                </Badge>
              ) : null}
              <Badge variant="outline">
                {t("import.result.skipped", { count: result.skipped })}
              </Badge>
              {result.errors.length > 0 ? (
                <Badge variant="destructive">
                  {t("import.result.errors", { count: result.errors.length })}
                </Badge>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button
              type="submit"
              disabled={importing || !rows || rows.length === 0}
            >
              {importing ? (
                <Spinner className="size-4" />
              ) : (
                <UploadIcon data-icon="inline-start" />
              )}
              {t("import.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
