import { AUDIT_ACTIONS } from "@workspace/audit"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@workspace/core/errors"
import type { RequestContext } from "@workspace/core/context"
import {
  decodeCursor,
  encodeCursor,
  pageSize,
  toPage,
  type Page,
  type PageInput,
} from "@workspace/core/pagination"
import { roleRank } from "@workspace/organization/roles"
import type { ProjectDb } from "./db"
import { toMemberView } from "./members"
import type { ProjectServicePorts } from "./ports"

import { ProjectRepository } from "./repository"
import { createTaskComment } from "./task-comments"
import { allocateTaskIdentifier, taskPrefix } from "./task-key"
import type {
  AddCommentInput,
  AddLabelInput,
  AddMemberInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateTaskTemplateInput,
  MoveTaskInput,
  UpdateMemberRoleInput,
  UpdateProjectClientSettingsInput,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateTaskTemplateInput,
} from "./schemas"
import type {
  Activity,
  Comment,
  Label,
  Member,
  Project,
  ProjectData,
  Subtask,
  Task,
  TaskCustomFieldValue,
  TaskCustomFieldValues,
  TaskTemplate,
  TaskTemplateField,
  TaskTemplateFieldType,
} from "./types"
import { ACTIVITY_STATUS_SENTINEL, TASK_TEMPLATE_FIELD_TYPES } from "./types"

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : undefined
}

function requiredIso(date: Date) {
  return date.toISOString()
}

/** The project fields a change is judged on. */
function projectSnapshot(project: Project) {
  return {
    name: project.name,
    description: project.description ?? null,
    status: project.status,
    dueDate: project.dueDate ?? null,
    memberIds: project.memberIds,
    labelIds: project.labelIds,
  }
}

/** The task fields a change is judged on. */
function taskSnapshot(task: Task) {
  return {
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId ?? null,
    dueDate: task.dueDate ?? null,
    endDate: task.endDate ?? null,
    labelIds: task.labelIds,
  }
}

type ProjectRow = NonNullable<
  Awaited<ReturnType<ProjectRepository["findById"]>>
>
type TaskRow = Awaited<ReturnType<ProjectRepository["listTasks"]>>[number]
type MemberRow = Awaited<ReturnType<ProjectRepository["listMembers"]>>[number]
type TemplateRow = Awaited<
  ReturnType<ProjectRepository["listTemplates"]>
>[number]

export class ProjectService {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly db: ProjectDb,
    private readonly ports: ProjectServicePorts
  ) {}

  private canWrite(ctx: RequestContext) {
    if (roleRank(ctx.role) >= 2) return
    throw new ForbiddenError("Your role cannot modify projects.", {
      code: "role_cannot_modify_projects",
    })
  }

  private canManage(ctx: RequestContext) {
    if (roleRank(ctx.role) >= 3) return
    throw new ForbiddenError("Your role cannot manage workspace members.", {
      code: "role_cannot_manage_members",
    })
  }

  /** Number of owner-role members in an organization. */
  private ownerCount(organizationId: string) {
    return this.db.member.count({ where: { organizationId, role: "owner" } })
  }

  private mapMember(row: MemberRow): Member {
    return toMemberView(row)
  }

  private mapTemplateFields(raw: unknown): TaskTemplateField[] {
    if (!Array.isArray(raw)) return []
    const fields: TaskTemplateField[] = []
    for (const item of raw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const record = item as Record<string, unknown>
      if (
        typeof record.id !== "string" ||
        typeof record.label !== "string" ||
        typeof record.type !== "string" ||
        !(TASK_TEMPLATE_FIELD_TYPES as readonly string[]).includes(record.type)
      ) {
        continue
      }
      fields.push({
        id: record.id,
        label: record.label,
        type: record.type as TaskTemplateFieldType,
        required: record.required === true,
        options: Array.isArray(record.options)
          ? record.options.filter(
              (option): option is string => typeof option === "string"
            )
          : [],
      })
    }
    return fields
  }

  private mapTaskCustomFields(raw: unknown): TaskCustomFieldValues {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
    const values: TaskCustomFieldValues = {}
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string" && value !== "") {
        values[key] = value
      } else if (Array.isArray(value)) {
        const list = value.filter(
          (item): item is string => typeof item === "string"
        )
        if (list.length) values[key] = list
      }
    }
    return values
  }

  private coerceTaskFieldValue(
    field: TaskTemplateField,
    raw: unknown
  ): TaskCustomFieldValue | undefined {
    switch (field.type) {
      case "text":
      case "textarea": {
        if (raw === null || raw === undefined) return undefined
        const value = String(raw).trim()
        return value === "" ? undefined : value
      }
      case "select":
      case "radio": {
        if (raw === null || raw === undefined) return undefined
        const value = String(raw)
        return field.options.includes(value) ? value : undefined
      }
      case "checkbox": {
        const list = Array.isArray(raw)
          ? raw.filter((item): item is string => typeof item === "string")
          : []
        const filtered = list.filter((item) => field.options.includes(item))
        return filtered.length ? filtered : undefined
      }
      case "date": {
        if (raw === null || raw === undefined || raw === "") return undefined
        if (typeof raw !== "string" || Number.isNaN(Date.parse(raw))) {
          throw new ValidationError(`“${field.label}” must be a date.`)
        }
        return new Date(raw).toISOString()
      }
    }
  }

  /**
   * Keep only values for the template's fields and enforce required ones.
   * Empty values are dropped so `customFields` never carries blanks.
   */
  private normalizeTaskCustomFields(
    fields: TaskTemplateField[],
    raw: unknown
  ): TaskCustomFieldValues {
    const source =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {}
    const values: TaskCustomFieldValues = {}
    for (const field of fields) {
      const value = this.coerceTaskFieldValue(field, source[field.id])
      const empty =
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      if (empty) {
        if (field.required) {
          throw new ValidationError(
            `“${field.label}” is required.`,
            undefined,
            { code: "custom_field_required", params: { field: field.label } }
          )
        }
        continue
      }
      values[field.id] = value
    }
    return values
  }

  private mapTemplate(row: TemplateRow): TaskTemplate {
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      description: row.description ?? undefined,
      status: row.status as TaskTemplate["status"],
      priority: row.priority as TaskTemplate["priority"],
      labelIds: row.labelIds,
      fields: this.mapTemplateFields(row.fields),
    }
  }

  private mapProject(
    row: ProjectRow,
    counts?: { total: number; done: number }
  ): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      status: row.status as Project["status"],
      clientId: row.clientId ?? undefined,
      clientName: row.client?.name,
      clientVisible: row.clientVisible,
      clientDiscussion: row.clientDiscussion as Project["clientDiscussion"],
      clientTaskComments:
        row.clientTaskComments as Project["clientTaskComments"],
      memberIds: row.members.map((member) => member.userId),
      labelIds: row.labels.map((label) => label.labelId),
      repositoryProvider:
        (row.repository?.provider as Project["repositoryProvider"]) ??
        undefined,
      taskCount: counts?.total ?? row._count?.tasks,
      doneTaskCount: counts?.done,
      createdAt: requiredIso(row.createdAt),
      dueDate: iso(row.dueDate),
    }
  }

  private mapTask(row: TaskRow): Task {
    return {
      id: row.id,
      identifier: row.identifier,
      projectId: row.projectId,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as Task["status"],
      priority: row.priority as Task["priority"],
      assigneeId: row.assigneeId ?? undefined,
      labelIds: row.labels.map((label) => label.labelId),
      dueDate: iso(row.dueDate),
      endDate: iso(row.endDate),
      templateId: row.templateId ?? undefined,
      customFields: this.mapTaskCustomFields(row.customFields),
      externalIssueNumber: row.externalIssueNumber ?? undefined,
      externalIssueUrl: row.externalIssueUrl ?? undefined,
      externalPrNumber: row.externalPrNumber ?? undefined,
      externalPrUrl: row.externalPrUrl ?? undefined,
      createdAt: requiredIso(row.createdAt),
      subtasks: row.subtasks.map((subtask): Subtask => ({
        id: subtask.id,
        title: subtask.title,
        done: subtask.done,
      })),
      comments: [...row.comments].reverse().map((comment): Comment => ({
        id: comment.id,
        authorId: comment.authorId,
        authorKind: comment.authorKind === "client" ? "client" : "internal",
        authorName: comment.authorName ?? undefined,
        body: comment.body,
        createdAt: requiredIso(comment.createdAt),
      })),
    }
  }

  private async listMembersView(ctx: RequestContext): Promise<Member[]> {
    const rows = await this.repo.listMembers(ctx.organizationId)
    return rows
      .map((row) => this.mapMember(row))
      .sort(
        (a, b) =>
          roleRank(b.role) - roleRank(a.role) || a.name.localeCompare(b.name)
      )
  }

  /**
   * Shell payload: projects, members, labels and templates without the task
   * history. The app layout calls this on every request.
   */
  async listShell(ctx: RequestContext): Promise<ProjectData> {
    const [projects, labels, members, templates, statusCounts] =
      await Promise.all([
        this.repo.listShell(ctx.organizationId),
        this.repo.listLabels(ctx.organizationId),
        this.listMembersView(ctx),
        this.repo.listTemplates(ctx.organizationId),
        this.repo.taskStatusCounts(ctx.organizationId),
      ])

    const counts = new Map<string, { total: number; done: number }>()
    for (const row of statusCounts) {
      const entry = counts.get(row.projectId) ?? { total: 0, done: 0 }
      entry.total += row._count._all
      if (row.status === "done") entry.done += row._count._all
      counts.set(row.projectId, entry)
    }

    return {
      projects: projects.map((project) =>
        this.mapProject(project, counts.get(project.id))
      ),
      tasks: [],
      members,
      labels: labels.map((label): Label => ({
        id: label.id,
        name: label.name,
        color: label.color,
      })),
      templates: templates.map((template) => this.mapTemplate(template)),
      activities: [],
    }
  }

  /**
   * Feature payload for the projects/calendar screens: tasks plus the latest
   * activity feed. Both are bounded so a large workspace cannot load its
   * entire history in one request.
   */
  async listWorkspace(
    ctx: RequestContext,
    options: { taskLimit?: number; activityLimit?: number } = {}
  ): Promise<{ tasks: Task[]; activities: Activity[] }> {
    const [tasks, activityRows] = await Promise.all([
      this.repo.listAllTasks(ctx.organizationId, options.taskLimit ?? 1000),
      this.repo.listActivities(ctx.organizationId, {
        take: options.activityLimit ?? 100,
      }),
    ])
    return {
      tasks: tasks.map((task) => this.mapTask(task)),
      activities: activityRows.map((activity): Activity => ({
        id: activity.id,
        projectId: activity.projectId,
        actorId: activity.actorId,
        action: activity.action,
        target: activity.target,
        createdAt: requiredIso(activity.createdAt),
      })),
    }
  }

  /** Full payload kept for the MCP/programmatic API. */
  async list(ctx: RequestContext): Promise<ProjectData> {
    const [shell, workspace] = await Promise.all([
      this.listShell(ctx),
      this.listWorkspace(ctx),
    ])
    return { ...shell, ...workspace }
  }

  /** Keyset-paginated activity feed (`(createdAt, id)` descending). */
  async listActivities(
    ctx: RequestContext,
    input: PageInput & { projectId?: string } = {}
  ): Promise<Page<Activity>> {
    const limit = pageSize(input.limit)
    const decoded = decodeCursor(input.cursor)
    const before =
      decoded && decoded[0] && decoded[1]
        ? { createdAt: new Date(decoded[0]), id: decoded[1] }
        : undefined
    const rows = await this.repo.listActivities(ctx.organizationId, {
      projectId: input.projectId,
      before,
      take: limit + 1,
    })
    const page = toPage(rows, limit, (row) =>
      encodeCursor([row.createdAt.toISOString(), row.id])
    )
    return {
      items: page.items.map((activity): Activity => ({
        id: activity.id,
        projectId: activity.projectId,
        actorId: activity.actorId,
        action: activity.action,
        target: activity.target,
        createdAt: requiredIso(activity.createdAt),
      })),
      nextCursor: page.nextCursor,
    }
  }

  async get(ctx: RequestContext, id: string): Promise<Project> {
    const row = await this.repo.findById(ctx.organizationId, id)
    if (!row) throw new NotFoundError("Project")
    return this.mapProject(row)
  }

  async create(
    ctx: RequestContext,
    input: CreateProjectInput
  ): Promise<Project> {
    this.canWrite(ctx)
    const row = await this.repo.create(ctx.organizationId, {
      name: input.name,
      description: input.description,
      status: input.status,
      memberIds: input.memberIds?.length ? input.memberIds : [ctx.userId],
      labelIds: input.labelIds ?? [],
    })
    const project = this.mapProject(row)
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.projectCreated,
      entityType: "project",
      entityId: project.id,
      entityLabel: project.name,
      after: projectSnapshot(project),
    })
    return project
  }

  async update(
    ctx: RequestContext,
    id: string,
    input: UpdateProjectInput
  ): Promise<Project> {
    this.canWrite(ctx)
    const before = await this.get(ctx, id)
    await this.repo.update(id, {
      name: input.name,
      description: input.description,
      status: input.status,
      dueDate:
        input.dueDate === undefined
          ? undefined
          : input.dueDate === null
            ? null
            : new Date(input.dueDate),
    })
    if (input.memberIds) await this.repo.setMembers(id, input.memberIds)
    if (input.labelIds) await this.repo.setLabels(id, input.labelIds)
    const fresh = await this.repo.findById(ctx.organizationId, id)
    if (!fresh) throw new NotFoundError("Project")
    const project = this.mapProject(fresh)
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.projectUpdated,
      entityType: "project",
      entityId: id,
      entityLabel: project.name,
      before: projectSnapshot(before),
      after: projectSnapshot(project),
    })
    return project
  }

  async remove(ctx: RequestContext, id: string): Promise<{ id: string }> {
    this.canWrite(ctx)
    const project = await this.get(ctx, id)
    await this.repo.delete(id)
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.projectDeleted,
      entityType: "project",
      entityId: id,
      entityLabel: project.name,
      before: projectSnapshot(project),
    })
    return { id }
  }

  /** Client-portal visibility and contribution policies of a project. */
  async updateClientSettings(
    ctx: RequestContext,
    input: UpdateProjectClientSettingsInput
  ): Promise<Project> {
    this.canManage(ctx)
    const before = await this.get(ctx, input.projectId)
    await this.repo.update(input.projectId, {
      clientVisible: input.clientVisible,
      clientDiscussion: input.clientDiscussion,
      clientTaskComments: input.clientTaskComments,
    })
    const fresh = await this.repo.findById(ctx.organizationId, input.projectId)
    if (!fresh) throw new NotFoundError("Project")
    const project = this.mapProject(fresh)
    const policies = (value: Project) => ({
      clientVisible: value.clientVisible,
      clientDiscussion: value.clientDiscussion,
      clientTaskComments: value.clientTaskComments,
    })
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.projectClientSettingsUpdated,
      entityType: "project",
      entityId: project.id,
      entityLabel: project.name,
      before: policies(before),
      after: policies(project),
    })
    return project
  }

  async listTasks(ctx: RequestContext, projectId: string): Promise<Task[]> {
    await this.get(ctx, projectId)
    const rows = await this.repo.listTasks(ctx.organizationId, projectId)
    return rows.map((row) => this.mapTask(row))
  }

  async getTask(ctx: RequestContext, id: string): Promise<Task> {
    const row = await this.repo.findTask(ctx.organizationId, id)
    if (!row) throw new NotFoundError("Task")
    return this.mapTask(row)
  }

  async createTask(ctx: RequestContext, input: CreateTaskInput): Promise<Task> {
    this.canWrite(ctx)
    const project = await this.get(ctx, input.projectId)
    const existing = await this.repo.listTasks(
      ctx.organizationId,
      input.projectId
    )
    const prefix = taskPrefix(
      project.name,
      existing.map((task) => task.identifier)
    )

    let customFields: TaskCustomFieldValues = {}
    if (input.templateId) {
      const template = await this.repo.findTemplate(
        ctx.organizationId,
        input.templateId
      )
      if (!template || template.projectId !== input.projectId) {
        throw new NotFoundError("Task template")
      }
      customFields = this.normalizeTaskCustomFields(
        this.mapTemplateFields(template.fields),
        input.customFields
      )
    }

    // In a connected project a task is normally expected to exist as a
    // repository issue: the issue is created first (authored by the acting
    // user's own token) and users without repository access cannot create the
    // task. Tasks explicitly opted out (`createIssue: false`) skip the remote
    // side entirely — no issue, no token, and later no pull request.
    const createIssue = input.createIssue !== false
    const remote = createIssue
      ? await this.ports.repository.createTaskInRepository(ctx, {
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          status: input.status,
        })
      : null

    const identifier = await allocateTaskIdentifier(
      this.db,
      ctx.organizationId,
      prefix
    )
    const row = await this.repo.createTask({
      organizationId: ctx.organizationId,
      projectId: input.projectId,
      identifier,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      templateId: input.templateId ?? null,
      customFields,
      order: existing.length,
      labelIds: input.labelIds ?? [],
      createIssue,
      externalIssueNumber: remote?.externalIssueNumber ?? null,
      externalIssueUrl: remote?.externalIssueUrl ?? null,
      externalUpdatedAt: remote?.externalUpdatedAt ?? null,
    })
    await this.repo.addActivity({
      projectId: input.projectId,
      actorId: ctx.userId,
      action: "created",
      target: identifier,
    })
    await this.ports.notify({
      organizationId: ctx.organizationId,
      userId: input.assigneeId,
      actorId: ctx.userId,
      type: "task.assigned",
      data: {
        taskId: row.id,
        identifier,
        title: input.title,
        projectId: project.id,
        projectName: project.name,
        actorName: ctx.userName,
      },
    })
    const task = this.mapTask(row)
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.taskCreated,
      entityType: "task",
      entityId: task.id,
      entityLabel: task.identifier,
      after: { projectId: task.projectId, ...taskSnapshot(task) },
    })
    return task
  }

  async updateTask(
    ctx: RequestContext,
    id: string,
    input: UpdateTaskInput
  ): Promise<Task> {
    this.canWrite(ctx)
    const existing = await this.repo.findTask(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Task")
    const titleChanged =
      input.title !== undefined && input.title !== existing.title
    const descriptionChanged =
      input.description !== undefined &&
      (input.description ?? null) !== (existing.description ?? null)
    const statusChanged =
      input.status !== undefined && input.status !== existing.status
    let customFields: TaskCustomFieldValues | undefined
    if (input.customFields !== undefined && existing.templateId) {
      const template = await this.repo.findTemplate(
        ctx.organizationId,
        existing.templateId
      )
      if (template) {
        customFields = this.normalizeTaskCustomFields(
          this.mapTemplateFields(template.fields),
          input.customFields
        )
      }
    }
    // Status changes go to the repository first: a user without access to the
    // connected repository cannot move the task (throws before the write).
    if (statusChanged && input.status) {
      await this.ports.repository.pushTaskStatus(ctx, id, input.status)
    }
    await this.repo.updateTask(id, {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId,
      dueDate:
        input.dueDate === undefined
          ? undefined
          : input.dueDate === null
            ? null
            : new Date(input.dueDate),
      endDate:
        input.endDate === undefined
          ? undefined
          : input.endDate === null
            ? null
            : new Date(input.endDate),
      customFields,
    })
    if (input.labelIds) await this.repo.setTaskLabels(id, input.labelIds)
    if (
      typeof input.assigneeId === "string" &&
      input.assigneeId !== existing.assigneeId
    ) {
      const project = await this.get(ctx, existing.projectId)
      await this.ports.notify({
        organizationId: ctx.organizationId,
        userId: input.assigneeId,
        actorId: ctx.userId,
        type: "task.assigned",
        data: {
          taskId: existing.id,
          identifier: existing.identifier,
          title: input.title ?? existing.title,
          projectId: existing.projectId,
          projectName: project.name,
          actorName: ctx.userName,
        },
      })
    }
    // Content edits are pushed to the linked issue after a short debounce
    // (the details panel persists per keystroke); these are best-effort.
    if (titleChanged || descriptionChanged) {
      this.ports.repository.scheduleContentPush(ctx.userId, id)
    }
    const fresh = await this.repo.findTask(ctx.organizationId, id)
    const task = this.mapTask(fresh ?? existing)
    const before = this.mapTask(existing)
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.taskUpdated,
      entityType: "task",
      entityId: id,
      entityLabel: task.identifier,
      before: taskSnapshot(before),
      after: taskSnapshot(task),
    })
    return task
  }

  async moveTask(
    ctx: RequestContext,
    id: string,
    input: MoveTaskInput
  ): Promise<Task> {
    this.canWrite(ctx)
    const existing = await this.repo.findTask(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Task")
    if (existing.status !== input.status) {
      // Mirror the move on the repository issue (close on done, PR on review)
      // before the local write, so access errors abort the move.
      await this.ports.repository.pushTaskStatus(ctx, id, input.status)
      await this.repo.updateTask(id, { status: input.status })
      await this.repo.addActivity({
        projectId: existing.projectId,
        actorId: ctx.userId,
        action: "moved",
        target: `${existing.identifier}${ACTIVITY_STATUS_SENTINEL}${input.status}`,
      })
      await this.ports.audit(ctx, {
        action: AUDIT_ACTIONS.taskMoved,
        entityType: "task",
        entityId: id,
        entityLabel: existing.identifier,
        before: { status: existing.status },
        after: { status: input.status },
      })
    }
    const fresh = await this.repo.findTask(ctx.organizationId, id)
    return this.mapTask(fresh ?? existing)
  }

  async removeTask(ctx: RequestContext, id: string): Promise<{ id: string }> {
    this.canWrite(ctx)
    const existing = await this.repo.findTask(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Task")
    // Close the issue first, otherwise the next sync would resurrect the
    // task; access errors abort the delete.
    await this.ports.repository.closeTaskIssue(ctx, id)
    await this.repo.deleteTask(id)
    await this.repo.addActivity({
      projectId: existing.projectId,
      actorId: ctx.userId,
      action: "deleted",
      target: existing.identifier,
    })
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.taskDeleted,
      entityType: "task",
      entityId: id,
      entityLabel: existing.identifier,
      before: {
        projectId: existing.projectId,
        title: existing.title,
        status: existing.status,
      },
    })
    return { id }
  }

  async toggleSubtask(
    ctx: RequestContext,
    taskId: string,
    subtaskId: string
  ): Promise<Task> {
    this.canWrite(ctx)
    const existing = await this.repo.findTask(ctx.organizationId, taskId)
    if (!existing) throw new NotFoundError("Task")
    const toggled = await this.repo.toggleSubtask(taskId, subtaskId)
    if (!toggled) throw new NotFoundError("Subtask")
    const fresh = await this.repo.findTask(ctx.organizationId, taskId)
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.taskSubtaskToggled,
      entityType: "task",
      entityId: taskId,
      entityLabel: existing.identifier,
      before: { subtaskId, done: !toggled.done },
      after: { subtaskId, done: toggled.done },
    })
    return this.mapTask(fresh ?? existing)
  }

  async addComment(
    ctx: RequestContext,
    taskId: string,
    input: AddCommentInput
  ): Promise<Task> {
    this.canWrite(ctx)
    const existing = await this.repo.findTask(ctx.organizationId, taskId)
    if (!existing) throw new NotFoundError("Task")
    await createTaskComment(
      { db: this.db, notify: this.ports.notify },
      {
        organizationId: ctx.organizationId,
        taskId,
        authorId: ctx.userId,
        authorKind: "internal",
        authorName: ctx.userName,
        body: input.body,
      }
    )
    await this.repo.addActivity({
      projectId: existing.projectId,
      actorId: ctx.userId,
      action: "commentedOn",
      target: existing.identifier,
    })
    const fresh = await this.repo.findTask(ctx.organizationId, taskId)
    return this.mapTask(fresh ?? existing)
  }

  async listMembers(ctx: RequestContext): Promise<Member[]> {
    return this.listMembersView(ctx)
  }

  /**
   * Keyset page of organization members ordered by `(createdAt, id)`.
   * Used by the REST members endpoint and member pickers that outgrow one page.
   */
  async listMembersPage(
    ctx: RequestContext,
    input: PageInput = {}
  ): Promise<Page<Member>> {
    const limit = pageSize(input.limit)
    const decoded = decodeCursor(input.cursor)
    const before =
      decoded && decoded[0] && decoded[1]
        ? { createdAt: new Date(decoded[0]), id: decoded[1] }
        : null
    const rows = await this.repo.listMembersPage(ctx.organizationId, {
      before,
      take: limit + 1,
    })
    const page = toPage(rows, limit, (row) =>
      encodeCursor([row.createdAt.toISOString(), row.id])
    )
    return {
      items: page.items.map((row) => this.mapMember(row)),
      nextCursor: page.nextCursor,
    }
  }

  async addMember(ctx: RequestContext, input: AddMemberInput): Promise<Member> {
    this.canManage(ctx)
    if (input.role === "owner" && ctx.role !== "owner") {
      throw new ForbiddenError("Only an owner can add another owner.", {
        code: "role_cannot_manage_members",
      })
    }
    const existingMember = await this.repo.findMemberByEmail(
      ctx.organizationId,
      input.email
    )
    if (existingMember)
      throw new ConflictError("That email is already a member.", {
        code: "email_already_member",
      })

    const user = await this.db.user.upsert({
      where: { email: input.email },
      update: {},
      create: {
        id: `user_${crypto.randomUUID()}`,
        name: input.name,
        email: input.email,
        emailVerified: false,
      },
    })
    await this.db.member.create({
      data: {
        id: `member_${crypto.randomUUID()}`,
        organizationId: ctx.organizationId,
        userId: user.id,
        role: input.role,
        createdAt: new Date(),
      },
    })
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.organizationMemberAdded,
      entityType: "member",
      entityId: user.id,
      entityLabel: user.email,
      after: { email: user.email, name: user.name, role: input.role },
    })
    return toMemberView({
      userId: user.id,
      role: input.role,
      user: { name: user.name, email: user.email, image: user.image },
    })
  }

  async updateMemberRole(
    ctx: RequestContext,
    memberId: string,
    input: UpdateMemberRoleInput
  ): Promise<Member> {
    this.canManage(ctx)
    const member = await this.db.member.findFirst({
      where: { organizationId: ctx.organizationId, userId: memberId },
      include: { user: true },
    })
    if (!member) throw new NotFoundError("Member")

    const isTargetOwner = member.role === "owner"
    // Only an owner may touch an owner, and only an owner may grant ownership.
    if ((isTargetOwner || input.role === "owner") && ctx.role !== "owner") {
      throw new ForbiddenError("Only an owner can change an owner's role.", {
        code: "role_cannot_manage_members",
      })
    }
    if (member.userId === ctx.userId) {
      throw new ForbiddenError("You cannot change your own role.", {
        code: "role_cannot_manage_members",
      })
    }
    // Never leave the organization without an owner.
    if (isTargetOwner && input.role !== "owner") {
      const owners = await this.ownerCount(ctx.organizationId)
      if (owners <= 1) {
        throw new ForbiddenError("The last owner cannot be demoted.", {
          code: "role_cannot_manage_members",
        })
      }
    }

    await this.db.member.update({
      where: { id: member.id },
      data: { role: input.role },
    })
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.organizationMemberRoleChanged,
      entityType: "member",
      entityId: member.userId,
      entityLabel: member.user.email,
      before: { role: member.role },
      after: { role: input.role },
    })
    return toMemberView({ ...member, role: input.role })
  }

  async removeMember(
    ctx: RequestContext,
    memberId: string
  ): Promise<{ id: string }> {
    this.canManage(ctx)
    const member = await this.db.member.findFirst({
      where: { organizationId: ctx.organizationId, userId: memberId },
      include: { user: { select: { email: true, name: true } } },
    })
    if (!member) throw new NotFoundError("Member")

    if (member.userId === ctx.userId) {
      throw new ForbiddenError("You cannot remove yourself.", {
        code: "role_cannot_manage_members",
      })
    }
    if (member.role === "owner") {
      if (ctx.role !== "owner") {
        throw new ForbiddenError("Only an owner can remove an owner.", {
          code: "role_cannot_manage_members",
        })
      }
      const owners = await this.ownerCount(ctx.organizationId)
      if (owners <= 1) {
        throw new ForbiddenError("The last owner cannot be removed.", {
          code: "role_cannot_manage_members",
        })
      }
    }

    await this.db.member.delete({ where: { id: member.id } })
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.organizationMemberRemoved,
      entityType: "member",
      entityId: member.userId,
      entityLabel: member.user.email,
      before: { role: member.role, email: member.user.email },
    })
    return { id: memberId }
  }

  async listLabels(ctx: RequestContext): Promise<Label[]> {
    const labels = await this.repo.listLabels(ctx.organizationId)
    return labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
    }))
  }

  async addLabel(ctx: RequestContext, input: AddLabelInput): Promise<Label> {
    this.canWrite(ctx)
    const existing = await this.repo.findByColor(
      ctx.organizationId,
      input.color
    )
    if (existing) {
      throw new ConflictError("That color is already used by another label.", {
        code: "label_color_already_used",
      })
    }
    const label = await this.repo.createLabel(
      ctx.organizationId,
      input.name,
      input.color
    )
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.projectLabelAdded,
      entityType: "label",
      entityId: label.id,
      entityLabel: label.name,
      after: { name: label.name, color: label.color },
    })
    return { id: label.id, name: label.name, color: label.color }
  }

  async removeLabel(ctx: RequestContext, id: string): Promise<{ id: string }> {
    this.canWrite(ctx)
    const removed = await this.repo.deleteLabel(id)
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.projectLabelRemoved,
      entityType: "label",
      entityId: id,
      entityLabel: removed.name,
      before: { name: removed.name, color: removed.color },
    })
    return { id }
  }

  async listTemplates(ctx: RequestContext): Promise<TaskTemplate[]> {
    const rows = await this.repo.listTemplates(ctx.organizationId)
    return rows.map((row) => this.mapTemplate(row))
  }

  async createTemplate(
    ctx: RequestContext,
    input: CreateTaskTemplateInput
  ): Promise<TaskTemplate> {
    this.canManage(ctx)
    await this.get(ctx, input.projectId)
    const row = await this.repo.createTemplate({
      organizationId: ctx.organizationId,
      projectId: input.projectId,
      name: input.name,
      description: input.description,
      status: input.status,
      priority: input.priority,
      labelIds: input.labelIds ?? [],
      fields: input.fields ?? [],
    })
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.projectTemplateCreated,
      entityType: "taskTemplate",
      entityId: row.id,
      entityLabel: row.name,
      after: { projectId: row.projectId, name: row.name },
    })
    return this.mapTemplate(row)
  }

  async updateTemplate(
    ctx: RequestContext,
    id: string,
    input: UpdateTaskTemplateInput
  ): Promise<TaskTemplate> {
    this.canManage(ctx)
    const existing = await this.repo.findTemplate(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Task template")
    const row = await this.repo.updateTemplate(id, {
      name: input.name,
      description: input.description,
      status: input.status,
      priority: input.priority,
      labelIds: input.labelIds,
      fields: input.fields,
    })
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.projectTemplateUpdated,
      entityType: "taskTemplate",
      entityId: id,
      entityLabel: row.name,
      before: { name: existing.name, description: existing.description },
      after: { name: row.name, description: row.description },
    })
    return this.mapTemplate(row)
  }

  async removeTemplate(
    ctx: RequestContext,
    id: string
  ): Promise<{ id: string }> {
    this.canManage(ctx)
    const existing = await this.repo.findTemplate(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Task template")
    await this.repo.deleteTemplate(id)
    await this.ports.audit(ctx, {
      action: AUDIT_ACTIONS.projectTemplateDeleted,
      entityType: "taskTemplate",
      entityId: id,
      entityLabel: existing.name,
      before: { projectId: existing.projectId, name: existing.name },
    })
    return { id }
  }
}
