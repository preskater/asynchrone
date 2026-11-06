"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"

import {
  TASK_IMPORT_FIELDS,
  TASK_IMPORT_MAX_ROWS,
  detectMapping,
  parseImportTable,
  toImportRows,
  type TaskImportIssue,
  type TaskImportMapping,
  type TaskImportResult,
  type TaskImportTable,
} from "../../task-import"
import { useProjectActions } from "../../ui/actions"
import { useProjectStore } from "../../ui/store"

const IGNORE = "__ignore__"

export function ImportTasksDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Projects.import")
  const te = useErrorTranslator()
  const { importTasks } = useProjectActions()
  const { reloadProjectData } = useProjectStore()

  const [text, setText] = React.useState("")
  const [table, setTable] = React.useState<TaskImportTable | null>(null)
  const [invalid, setInvalid] = React.useState(false)
  const [mapping, setMapping] = React.useState<TaskImportMapping | null>(null)
  const [result, setResult] = React.useState<TaskImportResult | null>(null)
  const [running, setRunning] = React.useState(false)

  function load(value: string) {
    const parsed = value.trim() ? parseImportTable(value) : null
    setText(value)
    setTable(parsed)
    setInvalid(Boolean(value.trim()) && !parsed)
    setMapping(parsed ? detectMapping(parsed.headers) : null)
    setResult(null)
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    load(await file.text())
    setText("")
  }

  async function run(dryRun: boolean) {
    if (!table || !mapping) return
    setRunning(true)
    try {
      const response = unwrapActionResult(
        await importTasks({
          projectId,
          dryRun,
          rows: toImportRows(table, mapping),
        })
      )
      setResult(response)
      if (!dryRun) reloadProjectData()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setRunning(false)
    }
  }

  const rowCount = table?.rows.length ?? 0
  const tooMany = rowCount > TASK_IMPORT_MAX_ROWS
  const imported = result !== null && !result.dryRun
  const headers = [...new Set(table?.headers ?? [])]
  const columnItems = [
    { label: t("ignore"), value: IGNORE },
    ...headers.map((header) => ({ label: header, value: header })),
  ]

  const issue = ({ row, code, value }: TaskImportIssue) => (
    <li key={`${row}-${code}-${value ?? ""}`}>
      <span className="font-medium">{t("rowLabel", { row })}</span>{" "}
      {t(`issues.${code}`, { value: value ?? "" })}
    </li>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) load("")
      }}
    >
      {/* ponytail: inline sizes because Tailwind does not scan this package, so
          `max-h-[90vh]` is never generated. Back to classes once globals.css
          has an @source for packages/. */}
      <DialogContent
        className="flex flex-col overflow-hidden"
        style={{
          maxHeight: "90vh",
          maxWidth: "min(42rem, calc(100% - 2rem))",
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { max: TASK_IMPORT_MAX_ROWS })}{" "}
            {t("noIssuesCreated")}
          </DialogDescription>
        </DialogHeader>

        {/* Only the body scrolls, so the action stays on screen. */}
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
          {result ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <div className="flex flex-wrap gap-2">
                <Badge>
                  {t(result.dryRun ? "result.toCreate" : "result.created", {
                    count: result.created,
                  })}
                </Badge>
                <Badge variant="outline">
                  {t("result.skipped", { count: result.skipped })}
                </Badge>
                {result.errors.length > 0 ? (
                  <Badge variant="destructive">
                    {t("result.errors", { count: result.errors.length })}
                  </Badge>
                ) : null}
                {result.warnings.length > 0 ? (
                  <Badge variant="secondary">
                    {t("result.warnings", { count: result.warnings.length })}
                  </Badge>
                ) : null}
              </div>
              {result.dryRun ? (
                <p className="text-xs text-muted-foreground">
                  {t("previewNote")}
                </p>
              ) : null}
              {result.errors.length + result.warnings.length > 0 ? (
                <ul
                  className="flex shrink-0 flex-col gap-1 overflow-y-auto rounded-md border p-3 text-sm"
                  style={{ maxHeight: "12rem" }}
                >
                  {result.errors.map(issue)}
                  {result.warnings.map(issue)}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-tasks-file">{t("file")}</Label>
            <Input
              id="import-tasks-file"
              type="file"
              accept=".csv,.tsv,.txt,.json,text/csv,application/json"
              onChange={(event) => void handleFile(event)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-tasks-paste">{t("paste")}</Label>
            <Textarea
              id="import-tasks-paste"
              value={text}
              rows={5}
              placeholder={t("pastePlaceholder")}
              onChange={(event) => load(event.target.value)}
            />
          </div>

          {invalid ? (
            <p role="alert" className="text-sm text-destructive">
              {t("invalid")}
            </p>
          ) : null}
          {tooMany ? (
            <p role="alert" className="text-sm text-destructive">
              {t("tooManyRows", {
                count: rowCount,
                max: TASK_IMPORT_MAX_ROWS,
              })}
            </p>
          ) : null}

          {table && mapping && !tooMany ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {t("rowsDetected", { count: rowCount })}
              </p>
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-medium">
                  {t("mapping")}
                </legend>
                {TASK_IMPORT_FIELDS.map((field) => (
                  <div key={field} className="flex flex-col gap-1.5">
                    <Label id={`import-tasks-${field}`}>
                      {t(`fields.${field}`)}
                    </Label>
                    <Select
                      items={columnItems}
                      value={mapping[field] ?? IGNORE}
                      onValueChange={(value) => {
                        setMapping({
                          ...mapping,
                          [field]: value === IGNORE ? null : value,
                        })
                        setResult(null)
                      }}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-labelledby={`import-tasks-${field}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {columnItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </fieldset>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {result?.dryRun && result.created > 0 ? (
            <Button disabled={running} onClick={() => void run(false)}>
              {running ? <Spinner className="size-4" /> : null}
              {t("confirm", { count: result.created })}
            </Button>
          ) : !imported ? (
            <Button
              disabled={running || !table || tooMany || !mapping?.title}
              onClick={() => void run(true)}
            >
              {running ? <Spinner className="size-4" /> : null}
              {t("preview")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
