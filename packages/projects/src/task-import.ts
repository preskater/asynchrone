import { parseCsv } from "@workspace/core/csv"

import type { TaskPriority, TaskStatus } from "./types"

export const TASK_IMPORT_MAX_ROWS = 500
const TITLE_MAX = 240
const DESCRIPTION_MAX = 5000

export const TASK_IMPORT_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "assignee",
  "labels",
  "dueDate",
] as const

export type TaskImportField = (typeof TASK_IMPORT_FIELDS)[number]
export type TaskImportMapping = Record<TaskImportField, string | null>

export interface TaskImportTable {
  headers: string[]
  rows: string[][]
}

/** One file row, unresolved: the server decides what each value means. */
export type TaskImportRow = { row: number; title: string } & Partial<
  Record<Exclude<TaskImportField, "title">, string>
>

export type TaskImportIssueCode =
  | "missing_title"
  | "title_too_long"
  | "unknown_status"
  | "unknown_priority"
  | "unknown_assignee"
  | "unknown_label"
  | "invalid_date"
  | "description_truncated"

export interface TaskImportIssue {
  row: number
  code: TaskImportIssueCode
  value?: string
}

export interface TaskImportResult {
  created: number
  skipped: number
  /** Rows left out. */
  errors: TaskImportIssue[]
  /** Rows imported without the value in question. */
  warnings: TaskImportIssue[]
  dryRun: boolean
}

const HEADER_ALIASES: Record<TaskImportField, string[]> = {
  title: ["title", "summary", "name", "task name", "card name", "issue title"],
  description: ["description", "card description", "body", "notes"],
  status: ["status", "state", "list name", "column"],
  priority: ["priority"],
  assignee: ["assignee email", "assignee", "assigned to", "owner"],
  labels: ["labels", "label", "tags"],
  dueDate: ["due date", "due", "duedate", "due_date", "deadline"],
}

const STATUS_ALIASES: Record<string, TaskStatus> = {
  backlog: "backlog",
  icebox: "backlog",
  triage: "backlog",
  todo: "todo",
  "to do": "todo",
  open: "todo",
  new: "todo",
  unstarted: "todo",
  "not started": "todo",
  "selected for development": "todo",
  in_progress: "in_progress",
  "in progress": "in_progress",
  doing: "in_progress",
  started: "in_progress",
  "in development": "in_progress",
  review: "review",
  "in review": "review",
  in_review: "review",
  "code review": "review",
  qa: "review",
  testing: "review",
  done: "done",
  closed: "done",
  resolved: "done",
  complete: "done",
  completed: "done",
  finished: "done",
}

const PRIORITY_ALIASES: Record<string, TaskPriority> = {
  lowest: "low",
  low: "low",
  minor: "low",
  trivial: "low",
  medium: "medium",
  normal: "medium",
  major: "high",
  high: "high",
  highest: "urgent",
  urgent: "urgent",
  critical: "urgent",
  blocker: "urgent",
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function cellText(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (Array.isArray(value))
    return value.map(cellText).filter(Boolean).join(", ")
  return ""
}

function parseJson(raw: string): TaskImportTable | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => item && typeof item === "object")
  ) {
    return null
  }
  const items = parsed as Record<string, unknown>[]
  const headers = [...new Set(items.flatMap((item) => Object.keys(item)))]
  return {
    headers,
    rows: items.map((item) => headers.map((key) => cellText(item[key]))),
  }
}

/** A CSV, a pasted table or a JSON array of objects; null when unreadable. */
export function parseImportTable(raw: string): TaskImportTable | null {
  const text = raw.replace(/^﻿/, "").trim()
  if (text.startsWith("[")) return parseJson(text)
  const [headers, ...rows] = parseCsv(text)
  return headers && rows.length > 0 ? { headers, rows } : null
}

export function detectMapping(headers: string[]): TaskImportMapping {
  const mapping = {} as TaskImportMapping
  for (const field of TASK_IMPORT_FIELDS) {
    const alias = HEADER_ALIASES[field].find((name) =>
      headers.some((header) => normalize(header) === name)
    )
    mapping[field] =
      headers.find((header) => normalize(header) === alias) ?? null
  }
  return mapping
}

export function toImportRows(
  table: TaskImportTable,
  mapping: TaskImportMapping
): TaskImportRow[] {
  // Jira repeats a column per value (`Labels`, `Labels`), so read them all.
  const read = (cells: string[], field: TaskImportField) =>
    table.headers
      .flatMap((header, index) =>
        header === mapping[field] ? [cells[index] ?? ""] : []
      )
      .filter(Boolean)
      .join(", ")

  return table.rows.map((cells, index) => {
    const row: TaskImportRow = { row: index + 1, title: read(cells, "title") }
    for (const field of TASK_IMPORT_FIELDS) {
      const value = read(cells, field)
      if (field !== "title" && value) row[field] = value
    }
    return row
  })
}

/**
 * ISO dates and dates that name their month. `01/02/2026` is refused: it is
 * 1 February in France and 2 January in the US, and a wrong date is worse than
 * none.
 */
export function parseImportDate(value: string): Date | null {
  const text = value.trim()
  const isIso = /^\d{4}-\d{2}-\d{2}/.test(text)
  if (!isIso && /^\d+[/.-]\d+[/.-]\d+/.test(text)) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

export function taskFingerprint(title: string, dueDate: Date | null): string {
  return `${normalize(title)}|${dueDate?.toISOString().slice(0, 10) ?? ""}`
}

export interface TaskImportLookups {
  memberIdByEmail: Map<string, string>
  labelIdByName: Map<string, string>
}

export interface ResolvedImportTask {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  assigneeId: string | null
  labelIds: string[]
  dueDate: Date | null
}

export function resolveImportRow(
  input: TaskImportRow,
  { memberIdByEmail, labelIdByName }: TaskImportLookups
): {
  task: ResolvedImportTask | null
  error: TaskImportIssue | null
  warnings: TaskImportIssue[]
} {
  const { row } = input
  const title = input.title.trim()
  if (!title) {
    return {
      task: null,
      error: { row, code: "missing_title" },
      warnings: [],
    }
  }
  if (title.length > TITLE_MAX) {
    return {
      task: null,
      error: { row, code: "title_too_long" },
      warnings: [],
    }
  }

  const warnings: TaskImportIssue[] = []
  const warn = (code: TaskImportIssueCode, value?: string) =>
    warnings.push({ row, code, value })

  const status = input.status
    ? STATUS_ALIASES[normalize(input.status)]
    : undefined
  if (input.status && !status) warn("unknown_status", input.status)

  const priority = input.priority
    ? PRIORITY_ALIASES[normalize(input.priority)]
    : undefined
  if (input.priority && !priority) warn("unknown_priority", input.priority)

  const assigneeId = input.assignee
    ? (memberIdByEmail.get(normalize(input.assignee)) ?? null)
    : null
  if (input.assignee && !assigneeId) warn("unknown_assignee", input.assignee)

  const labelIds = new Set<string>()
  for (const name of (input.labels ?? "").split(/[,;]/)) {
    if (!name.trim()) continue
    const id = labelIdByName.get(normalize(name))
    if (id) labelIds.add(id)
    else warn("unknown_label", name.trim())
  }

  const dueDate = input.dueDate ? parseImportDate(input.dueDate) : null
  if (input.dueDate && !dueDate) warn("invalid_date", input.dueDate)

  if (input.description && input.description.length > DESCRIPTION_MAX) {
    warn("description_truncated")
  }

  return {
    task: {
      title,
      description: input.description?.slice(0, DESCRIPTION_MAX),
      status,
      priority,
      assigneeId,
      labelIds: [...labelIds],
      dueDate,
    },
    error: null,
    warnings,
  }
}
