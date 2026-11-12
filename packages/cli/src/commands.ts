import { parseArgs } from "node:util"

import { ApiClient } from "./client.js"
import { configPath, readConfig, writeConfig } from "./config.js"
import { CliError, EXIT } from "./errors.js"

export interface Label {
  id: string
  name: string
  color: string
}
export interface Project {
  id: string
  name: string
  status: string
  labels: Label[]
}
export interface Task {
  id: string
  identifier: string
  projectId: string
  title: string
  status: string
  priority: string
  assigneeId?: string
  labelIds: string[]
  dueDate?: string
  url?: string
}
export interface Member {
  id: string
  name: string
  email: string
  roles: string[]
}
export interface TokenInfo {
  prefix: string
  scopes: string[]
  expiresAt: string
  user: { id: string; name: string; email: string }
  organization: { id: string; name: string; slug: string }
}

export const STATUSES = ["backlog", "todo", "in_progress", "review", "done"]
export const PRIORITIES = ["low", "medium", "high", "urgent"]
const TASK_KEY = /^[A-Za-z]+-\d+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export interface Io {
  out: (line: string) => void
  readStdin: () => Promise<string>
  readFile: (file: string) => Promise<string>
}

export interface Context {
  client: ApiClient
  json: boolean
  io: Io
  env: Record<string, string | undefined>
  tokenSource: string | null
}

export const USAGE = `asynchrone — Asynchrone Space from the terminal

Usage:
  asynchrone auth login --token <asy_…> [--api-url <url>]
  asynchrone auth status
  asynchrone projects list
  asynchrone labels list [--project <id|name>]
  asynchrone members list
  asynchrone tasks list --project <id|name> [--status <s>] [--assignee <email|me>]
  asynchrone tasks create --project <id|name> --title <text>
      [--description <text> | --description-file <path|->]
      [--status <s>] [--priority <p>] [--assignee <email|id|me>]
      [--label <name>]… [--due <YYYY-MM-DD>] [--create-issue]
      [--idempotency-key <key>] [--dry-run]
  asynchrone tasks update <id|KEY-123> [--project <id|name>]
      [--title <text>] [--description <text> | --description-file <path|->]
      [--status <s>] [--priority <p>] [--assignee <email|id|me|none>]
      [--due <YYYY-MM-DD|none>] [--dry-run]

Global options:
  --token <asy_…>     Overrides ASYNCHRONE_TOKEN and the config file
  --api-url <url>     Overrides ASYNCHRONE_API_URL (default https://copilot.asynchrone.space)
  --json              Machine-readable output
  -h, --help          This help

Statuses: ${STATUSES.join(", ")}. Priorities: ${PRIORITIES.join(", ")}.
Exit codes: 0 ok, 1 failure, 2 invalid input, 3 authentication, 4 forbidden, 5 rate limited.`

function invalid(message: string): never {
  throw new CliError(message, EXIT.invalidInput)
}

function oneOf(value: string | undefined, allowed: string[], flag: string) {
  if (value !== undefined && !allowed.includes(value)) {
    invalid(`--${flag} must be one of: ${allowed.join(", ")}.`)
  }
  return value
}

function dueDate(value: string | undefined, allowNone: boolean) {
  if (value === undefined) return undefined
  if (allowNone && value === "none") return null
  if (!DATE.test(value)) invalid("--due must be a date like 2026-12-31.")
  return value
}

function print(ctx: Context, value: unknown, lines: () => string[]) {
  if (ctx.json) ctx.io.out(JSON.stringify(value, null, 2))
  else for (const line of lines()) ctx.io.out(line)
}

async function projects(ctx: Context) {
  return ctx.client.request<Project[]>("GET", "/projects")
}

/** An exact id wins; otherwise a case-insensitive name must match one project. */
export async function resolveProject(ctx: Context, ref: string) {
  const all = await projects(ctx)
  const byId = all.find((project) => project.id === ref)
  if (byId) return byId
  const byName = all.filter(
    (project) => project.name.toLowerCase() === ref.toLowerCase()
  )
  if (byName.length === 1) return byName[0]!
  if (byName.length > 1) {
    invalid(`Several projects are named "${ref}"; pass the project id.`)
  }
  return invalid(
    `No project "${ref}". Run \`asynchrone projects list\` to see them.`
  )
}

async function resolveAssignee(ctx: Context, ref: string) {
  if (ref === "me") {
    return (await ctx.client.request<TokenInfo>("GET", "/token")).user.id
  }
  if (!ref.includes("@")) return ref
  const members = await ctx.client.request<Member[]>("GET", "/members")
  const member = members.find(
    (item) => item.email.toLowerCase() === ref.toLowerCase()
  )
  return member?.id ?? invalid(`No workspace member with the email ${ref}.`)
}

async function description(
  ctx: Context,
  text: string | undefined,
  file: string | undefined
) {
  if (text !== undefined && file !== undefined) {
    invalid("Use --description or --description-file, not both.")
  }
  if (file === undefined) return text
  return (
    file === "-" ? await ctx.io.readStdin() : await ctx.io.readFile(file)
  ).replace(/\s+$/, "")
}

function taskLine(task: Task) {
  const due = task.dueDate ? `  due ${task.dueDate.slice(0, 10)}` : ""
  return `${task.identifier.padEnd(9)} ${task.status.padEnd(11)} ${task.priority.padEnd(7)} ${task.title}${due}`
}

async function authLogin(
  ctx: Context,
  values: { token?: string; "api-url"?: string }
) {
  if (!values.token) invalid("auth login needs --token <asy_…>.")
  const info = await ctx.client.request<TokenInfo>("GET", "/token")
  const file = configPath(ctx.env)
  const stored = await readConfig(file)
  await writeConfig(file, {
    ...stored,
    token: values.token,
    ...(values["api-url"] ? { apiUrl: values["api-url"] } : {}),
  })
  print(ctx, { ...info, configFile: file }, () => [
    `Logged in as ${info.user.name} <${info.user.email}> in ${info.organization.name}.`,
    `Token saved to ${file}.`,
  ])
}

async function authStatus(ctx: Context) {
  const info = await ctx.client.request<TokenInfo>("GET", "/token")
  print(ctx, { ...info, tokenSource: ctx.tokenSource }, () => [
    `${info.user.name} <${info.user.email}> in ${info.organization.name} (${info.organization.slug})`,
    `Token ${info.prefix} from ${ctx.tokenSource ?? "unknown"}, expires ${info.expiresAt.slice(0, 10)}`,
    `Scopes: ${info.scopes.join(", ")}`,
  ])
}

const TASK_OPTIONS = {
  project: { type: "string" },
  title: { type: "string" },
  description: { type: "string" },
  "description-file": { type: "string" },
  status: { type: "string" },
  priority: { type: "string" },
  assignee: { type: "string" },
  label: { type: "string", multiple: true },
  due: { type: "string" },
  "create-issue": { type: "boolean" },
  "idempotency-key": { type: "string" },
  "dry-run": { type: "boolean" },
} as const

async function tasksList(ctx: Context, args: string[]) {
  const { values } = parseArgs({ args, options: TASK_OPTIONS, strict: true })
  if (!values.project) invalid("tasks list needs --project <id|name>.")
  const status = oneOf(values.status, STATUSES, "status")
  const project = await resolveProject(ctx, values.project)
  const assignee = values.assignee
    ? await resolveAssignee(ctx, values.assignee)
    : undefined
  const tasks = (
    await ctx.client.request<Task[]>(
      "GET",
      `/tasks?projectId=${encodeURIComponent(project.id)}`
    )
  ).filter(
    (task) =>
      (!status || task.status === status) &&
      (!assignee || task.assigneeId === assignee)
  )
  print(ctx, tasks, () => (tasks.length ? tasks.map(taskLine) : ["No tasks."]))
}

async function tasksCreate(ctx: Context, args: string[]) {
  const { values } = parseArgs({ args, options: TASK_OPTIONS, strict: true })
  if (!values.project) invalid("tasks create needs --project <id|name>.")
  if (!values.title?.trim()) invalid("tasks create needs --title <text>.")
  const status = oneOf(values.status, STATUSES, "status")
  const priority = oneOf(values.priority, PRIORITIES, "priority")
  const due = dueDate(values.due, false)
  const body_ = await description(
    ctx,
    values.description,
    values["description-file"]
  )
  const project = await resolveProject(ctx, values.project)

  const labelIds = (values.label ?? []).map((name) => {
    const label = project.labels.find(
      (item) => item.name.toLowerCase() === name.toLowerCase()
    )
    return (
      label?.id ??
      invalid(
        `Project "${project.name}" has no label "${name}". Run \`asynchrone labels list --project ${project.id}\`.`
      )
    )
  })
  const body = {
    projectId: project.id,
    title: values.title.trim(),
    ...(body_ ? { description: body_ } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(values.assignee
      ? { assigneeId: await resolveAssignee(ctx, values.assignee) }
      : {}),
    ...(labelIds.length ? { labelIds } : {}),
    ...(due ? { dueDate: due } : {}),
    createIssue: values["create-issue"] === true,
  }

  if (values["dry-run"]) {
    print(
      ctx,
      {
        dryRun: true,
        request: { method: "POST", path: "/api/v1/tasks", body },
      },
      () => [
        "Dry run, nothing was created. Request body:",
        JSON.stringify(body, null, 2),
      ]
    )
    return
  }
  const task = await ctx.client.request<Task>("POST", "/tasks", {
    body,
    idempotencyKey: values["idempotency-key"],
  })
  print(ctx, task, () => [
    `Created ${task.identifier}: ${task.title}`,
    ...(task.url ? [task.url] : []),
  ])
}

async function tasksUpdate(ctx: Context, args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: TASK_OPTIONS,
    strict: true,
    allowPositionals: true,
  })
  const ref = positionals[0]
  if (!ref || positionals.length > 1) {
    invalid("tasks update needs one task id or key, e.g. AB-123.")
  }
  const status = oneOf(values.status, STATUSES, "status")
  const priority = oneOf(values.priority, PRIORITIES, "priority")
  const due = dueDate(values.due, true)
  const text = await description(
    ctx,
    values.description,
    values["description-file"]
  )

  const patch = {
    ...(values.title !== undefined ? { title: values.title.trim() } : {}),
    ...(text !== undefined ? { description: text } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(values.assignee === "none"
      ? { assigneeId: null }
      : values.assignee
        ? { assigneeId: await resolveAssignee(ctx, values.assignee) }
        : {}),
    ...(due !== undefined ? { dueDate: due } : {}),
  }
  if (Object.keys(patch).length === 0) invalid("Nothing to update.")

  let taskId = ref
  if (TASK_KEY.test(ref)) {
    // Keys are not unique across projects, so a key needs its project.
    if (!values.project) {
      invalid(`To update ${ref} by its key, also pass --project <id|name>.`)
    }
    const project = await resolveProject(ctx, values.project)
    const tasks = await ctx.client.request<Task[]>(
      "GET",
      `/tasks?projectId=${encodeURIComponent(project.id)}`
    )
    taskId =
      tasks.find((task) => task.identifier.toUpperCase() === ref.toUpperCase())
        ?.id ?? invalid(`No task ${ref} in "${project.name}".`)
  }

  if (values["dry-run"]) {
    print(
      ctx,
      {
        dryRun: true,
        request: {
          method: "PATCH",
          path: `/api/v1/tasks/${taskId}`,
          body: patch,
        },
      },
      () => [
        "Dry run, nothing was changed. Request body:",
        JSON.stringify(patch, null, 2),
      ]
    )
    return
  }
  const task = await ctx.client.request<Task>(
    "PATCH",
    `/tasks/${encodeURIComponent(taskId)}`,
    { body: patch, idempotencyKey: values["idempotency-key"] }
  )
  print(ctx, task, () => [`Updated ${task.identifier}: ${taskLine(task)}`])
}

/** Runs one command; `main.ts` owns the process (argv, exit code, streams). */
export async function run(
  command: string[],
  rest: string[],
  ctx: Context,
  authValues: { token?: string; "api-url"?: string }
) {
  const [group, action] = command
  switch (`${group} ${action}`) {
    case "auth login":
      return authLogin(ctx, authValues)
    case "auth status":
      return authStatus(ctx)
    case "projects list": {
      const list = await projects(ctx)
      return print(ctx, list, () =>
        list.length
          ? list.map(
              (project) => `${project.id}  ${project.name}  (${project.status})`
            )
          : ["No projects."]
      )
    }
    case "labels list": {
      const { values } = parseArgs({
        args: rest,
        options: TASK_OPTIONS,
        strict: true,
      })
      const source = values.project
        ? [await resolveProject(ctx, values.project)]
        : await projects(ctx)
      const labels = [
        ...new Map(
          source
            .flatMap((project) => project.labels)
            .map((label) => [label.id, label])
        ).values(),
      ]
      return print(ctx, labels, () =>
        labels.length
          ? labels.map((label) => `${label.name}  ${label.color}`)
          : ["No labels."]
      )
    }
    case "members list": {
      const members = await ctx.client.request<Member[]>("GET", "/members")
      return print(ctx, members, () =>
        members.map(
          (member) =>
            `${member.email}  ${member.name}  (${member.roles.join(", ")})`
        )
      )
    }
    case "tasks list":
      return tasksList(ctx, rest)
    case "tasks create":
      return tasksCreate(ctx, rest)
    case "tasks update":
      return tasksUpdate(ctx, rest)
    default:
      invalid(
        `Unknown command "${command.filter(Boolean).join(" ")}".\n\n${USAGE}`
      )
  }
}
