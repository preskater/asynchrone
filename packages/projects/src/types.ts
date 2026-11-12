import type { RepositoryProvider } from "./integrations/types"

export type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done"

export type TaskPriority = "low" | "medium" | "high" | "urgent"

export type ProjectStatus = "active" | "paused" | "completed"

export type MemberRole = "owner" | "admin" | "member" | "developer" | "viewer"

export interface Member {
  id: string
  name: string
  email: string
  avatarUrl?: string
  /** Primary role. */
  role: MemberRole
  /** Every role the member holds; several can only be edited in Copilot. */
  roles: MemberRole[]
}

export interface Label {
  id: string
  name: string
  color: string
}

export const TASK_TEMPLATE_FIELD_TYPES = [
  "text",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "date",
] as const

export type TaskTemplateFieldType = (typeof TASK_TEMPLATE_FIELD_TYPES)[number]

/** Input types with a fixed list of options. */
export const CHOICE_FIELD_TYPES: TaskTemplateFieldType[] = [
  "select",
  "radio",
  "checkbox",
]

/**
 * One custom input of a task template. The default task fields (title,
 * description, status, …) are always shown; these extend the form.
 */
export interface TaskTemplateField {
  /** Stable key used to store the value on the task. */
  id: string
  label: string
  type: TaskTemplateFieldType
  required: boolean
  options: string[]
}

/** Custom field values of a task, keyed by `TaskTemplateField.id`. */
export type TaskCustomFieldValue = string | string[]
export type TaskCustomFieldValues = Record<string, TaskCustomFieldValue>

/** True when a custom field value holds nothing (blank text, empty list). */
export function isEmptyTaskCustomFieldValue(
  value: TaskCustomFieldValue | undefined
): boolean {
  if (value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  return value.length === 0
}

export interface TaskTemplate {
  id: string
  projectId: string
  name: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  labelIds: string[]
  fields: TaskTemplateField[]
}

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Comment {
  id: string
  authorId: string
  authorKind: "internal" | "client" | "guest"
  authorName?: string
  body: string
  createdAt: string
}

export interface Task {
  id: string
  identifier: string
  projectId: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  assigneeId?: string
  labelIds: string[]
  dueDate?: string
  endDate?: string
  /** Template this task was created from, if any. */
  templateId?: string
  /** Values for the template's custom fields. */
  customFields: TaskCustomFieldValues
  /** Repository issue this task is synced with (repository connection). */
  externalIssueNumber?: number
  externalIssueUrl?: string
  /** Pull/merge request opened from this task's issue, if any. */
  externalPrNumber?: number
  externalPrUrl?: string
  createdAt: string
  subtasks: Subtask[]
  comments: Comment[]
}

export interface Project {
  id: string
  name: string
  description?: string
  status: ProjectStatus
  clientId?: string
  clientName?: string
  /** Client-portal visibility and contribution policies. */
  clientVisible: boolean
  clientDiscussion: PortalPolicy
  clientTaskComments: PortalPolicy
  /** GitHub/GitLab repository connected to this project, when there is one. */
  repositoryProvider?: RepositoryProvider
  memberIds: string[]
  labelIds: string[]
  /** Shell counters, computed without loading tasks. */
  taskCount?: number
  doneTaskCount?: number
  plannedHours?: number | null
  isBillable: boolean
  startDate?: string | null
  endDate?: string | null
  createdAt: string
  dueDate?: string
}

/** Client-portal contribution policy: hidden, read-only, or read & write. */
export const PORTAL_POLICIES = ["none", "read", "read_write"] as const
export type PortalPolicy = (typeof PORTAL_POLICIES)[number]

export interface Activity {
  id: string
  projectId: string
  actorId: string
  action: string
  target: string
  createdAt: string
}

/**
 * Persisted activity `action` values are stable camelCase keys that map to the
 * `Activity` catalog namespace (see `messages/<locale>/activity.json`), e.g.
 * `created`, `moved`, `deleted`, `commentedOn`, `requestedReviewOn`.
 *
 * Task moves additionally need the destination status. Since `target` is a
 * single string, the status value is appended using this sentinel:
 *   `target = "<identifier>__STATUS__<statusValue>"` (e.g. `WEB-3__STATUS__in_progress`).
 * Renderers split on {@link ACTIVITY_STATUS_SENTINEL} and translate the status
 * via `Enums.taskStatus`, then render `Activity.taskMoved` (`"{identifier} to {status}"`).
 */
export const ACTIVITY_STATUS_SENTINEL = "__STATUS__"

export interface ProjectData {
  projects: Project[]
  tasks: Task[]
  members: Member[]
  labels: Label[]
  templates: TaskTemplate[]
  activities: Activity[]
}

export const TASK_STATUS_VALUES: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
]

export const TASK_PRIORITY_VALUES: TaskPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
]

export const PROJECT_STATUS_VALUES: ProjectStatus[] = [
  "active",
  "paused",
  "completed",
]

export function formatDate(value?: string, locale = "en") {
  if (!value) return null
  return new Date(value).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  })
}
