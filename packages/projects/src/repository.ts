import type { MemberDirectoryPort } from "@workspace/organization/directory"

import type { ProjectDb } from "./db"

/**
 * Project relations needed by the app shell (sidebar, pickers, cards).
 * Tasks and activities are loaded separately by the projects feature so the
 * shell never pays for workspace-wide task history.
 */
export const projectInclude = {
  members: { include: { project: false } },
  labels: { include: { label: true } },
  repository: { select: { provider: true } },
  _count: { select: { tasks: true } },
}

/** Task relations shared by every task query. */
export const taskInclude = {
  subtasks: { orderBy: { order: "asc" as const } },
  // Latest 100 comments per task; the service reverses them for display.
  comments: { orderBy: { createdAt: "desc" as const }, take: 100 },
  labels: { include: { label: true } },
}

export type ProjectWithRelations = Awaited<
  ReturnType<ProjectRepository["findById"]>
>

export class ProjectRepository {
  constructor(
    private readonly db: ProjectDb,
    private readonly directory: MemberDirectoryPort
  ) {}

  listShell(organizationId: string) {
    return this.db.project.findMany({
      where: { organizationId },
      include: projectInclude,
      orderBy: { createdAt: "desc" },
    })
  }

  /** Per-status task counts for every project in the organization. */
  taskStatusCounts(organizationId: string) {
    return this.db.task.groupBy({
      by: ["projectId", "status"],
      where: { organizationId },
      _count: { _all: true },
    })
  }

  /** Tasks of the whole organization (project board hydration). */
  listAllTasks(organizationId: string, limit = 1000) {
    return this.db.task.findMany({
      where: { organizationId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: taskInclude,
      take: limit,
    })
  }

  /** Latest project activity, optionally scoped to one project. */
  listActivities(
    organizationId: string,
    options: {
      projectId?: string
      before?: { createdAt: Date; id: string }
      take?: number
    } = {}
  ) {
    return this.db.projectActivity.findMany({
      where: {
        project: { organizationId },
        ...(options.projectId ? { projectId: options.projectId } : {}),
        ...(options.before
          ? {
              OR: [
                { createdAt: { lt: options.before.createdAt } },
                {
                  createdAt: options.before.createdAt,
                  id: { lt: options.before.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options.take ?? 100,
    })
  }

  findById(organizationId: string, id: string) {
    return this.db.project.findFirst({
      where: { id, organizationId },
      include: projectInclude,
    })
  }

  create(
    organizationId: string,
    data: {
      name: string
      description?: string
      status?: string
      memberIds: string[]
      labelIds: string[]
    }
  ) {
    return this.db.project.create({
      data: {
        organizationId,
        name: data.name,
        description: data.description,
        status: data.status ?? "active",
        members: {
          create: data.memberIds.map((userId) => ({ userId })),
        },
        labels: {
          create: data.labelIds.map((labelId) => ({ labelId })),
        },
      },
      include: projectInclude,
    })
  }

  update(
    id: string,
    data: {
      name?: string
      description?: string | null
      status?: string
      dueDate?: Date | null
      clientId?: string | null
      plannedHours?: number | null
      isBillable?: boolean
      startDate?: Date | null
      endDate?: Date | null
      clientVisible?: boolean
      clientDiscussion?: string
      clientTaskComments?: string
    }
  ) {
    return this.db.project.update({
      where: { id },
      data,
      include: projectInclude,
    })
  }

  setMembers(projectId: string, userIds: string[]) {
    return this.db.$transaction([
      this.db.projectMember.deleteMany({ where: { projectId } }),
      this.db.projectMember.createMany({
        data: userIds.map((userId) => ({ projectId, userId })),
        skipDuplicates: true,
      }),
    ])
  }

  setLabels(projectId: string, labelIds: string[]) {
    return this.db.$transaction([
      this.db.projectLabel.deleteMany({ where: { projectId } }),
      this.db.projectLabel.createMany({
        data: labelIds.map((labelId) => ({ projectId, labelId })),
        skipDuplicates: true,
      }),
    ])
  }

  delete(id: string) {
    return this.db.project.delete({ where: { id } })
  }

  // --- tasks ---

  listTasks(organizationId: string, projectId: string) {
    return this.db.task.findMany({
      where: { organizationId, projectId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: taskInclude,
    })
  }

  findTask(organizationId: string, id: string) {
    return this.db.task.findFirst({
      where: { id, organizationId },
      include: taskInclude,
    })
  }

  countTasksForProject(projectId: string) {
    return this.db.task.count({ where: { projectId } })
  }

  identifierExists(organizationId: string, identifier: string) {
    return this.db.task.findFirst({
      where: { organizationId, identifier },
      select: { id: true },
    })
  }

  createTask(data: {
    organizationId: string
    projectId: string
    identifier: string
    title: string
    description?: string
    status?: string
    priority?: string
    assigneeId?: string | null
    dueDate?: Date | null
    endDate?: Date | null
    templateId?: string | null
    customFields?: unknown
    order: number
    labelIds: string[]
    createIssue?: boolean
    externalIssueNumber?: number | null
    externalIssueUrl?: string | null
    externalUpdatedAt?: Date | null
  }) {
    return this.db.task.create({
      data: {
        organizationId: data.organizationId,
        projectId: data.projectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description,
        status: data.status ?? "todo",
        priority: data.priority ?? "medium",
        assigneeId: data.assigneeId ?? null,
        dueDate: data.dueDate ?? null,
        endDate: data.endDate ?? null,
        templateId: data.templateId ?? null,
        customFields: (data.customFields ?? {}) as never,
        order: data.order,
        createIssue: data.createIssue ?? true,
        externalIssueNumber: data.externalIssueNumber ?? null,
        externalIssueUrl: data.externalIssueUrl ?? null,
        externalUpdatedAt: data.externalUpdatedAt ?? null,
        labels: {
          create: data.labelIds.map((labelId) => ({ labelId })),
        },
      },
      include: taskInclude,
    })
  }

  updateTask(
    id: string,
    data: {
      title?: string
      description?: string | null
      status?: string
      priority?: string
      assigneeId?: string | null
      dueDate?: Date | null
      endDate?: Date | null
      customFields?: unknown
    }
  ) {
    return this.db.task.update({
      where: { id },
      data: {
        ...data,
        customFields:
          data.customFields === undefined
            ? undefined
            : (data.customFields as never),
      },
      include: taskInclude,
    })
  }

  setTaskLabels(taskId: string, labelIds: string[]) {
    return this.db.$transaction([
      this.db.taskLabel.deleteMany({ where: { taskId } }),
      this.db.taskLabel.createMany({
        data: labelIds.map((labelId) => ({ taskId, labelId })),
        skipDuplicates: true,
      }),
    ])
  }

  deleteTask(id: string) {
    return this.db.task.delete({ where: { id } })
  }

  async toggleSubtask(taskId: string, subtaskId: string) {
    const subtask = await this.db.subtask.findFirst({
      where: { id: subtaskId, taskId },
    })
    if (!subtask) return null
    return this.db.subtask.update({
      where: { id: subtaskId },
      data: { done: !subtask.done },
    })
  }

  addComment(
    taskId: string,
    authorId: string,
    body: string,
    options: {
      authorKind: "internal" | "client" | "guest"
      authorName?: string
    }
  ) {
    return this.db.taskComment.create({
      data: {
        taskId,
        authorId,
        body,
        authorKind: options.authorKind,
        authorName: options.authorName ?? null,
      },
    })
  }

  // --- activity ---

  addActivity(data: {
    projectId: string
    actorId: string
    action: string
    target: string
  }) {
    return this.db.projectActivity.create({ data })
  }

  // --- labels ---

  listLabels(organizationId: string) {
    return this.db.label.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    })
  }

  createLabel(organizationId: string, name: string, color: string) {
    return this.db.label.create({ data: { organizationId, name, color } })
  }

  findByColor(organizationId: string, color: string) {
    return this.db.label.findFirst({
      where: { organizationId, color: { equals: color, mode: "insensitive" } },
    })
  }

  deleteLabel(id: string) {
    return this.db.label.delete({ where: { id } })
  }

  // --- task templates ---

  listTemplates(organizationId: string) {
    return this.db.taskTemplate.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    })
  }

  findTemplate(organizationId: string, id: string) {
    return this.db.taskTemplate.findFirst({
      where: { id, organizationId },
    })
  }

  createTemplate(data: {
    organizationId: string
    projectId: string
    name: string
    description?: string
    status?: string
    priority?: string
    labelIds: string[]
    fields?: unknown
  }) {
    return this.db.taskTemplate.create({
      data: { ...data, fields: data.fields as never },
    })
  }

  updateTemplate(
    id: string,
    data: {
      name?: string
      description?: string | null
      status?: string
      priority?: string
      labelIds?: string[]
      fields?: unknown
    }
  ) {
    return this.db.taskTemplate.update({
      where: { id },
      data: {
        ...data,
        fields: data.fields === undefined ? undefined : (data.fields as never),
      },
    })
  }

  deleteTemplate(id: string) {
    return this.db.taskTemplate.delete({ where: { id } })
  }

  // --- members ---

  /** Internal members only; portal clients never appear in project pickers. */
  async listMembers(organizationId: string) {
    const entries = await this.directory.list(organizationId)
    return entries
      .filter((entry) => entry.clientId == null)
      .sort(
        (a, b) =>
          (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0) ||
          a.userId.localeCompare(b.userId)
      )
  }

  /** Keyset page ordered by `(joinedAt, userId)`, oldest first. */
  async listMembersPage(
    organizationId: string,
    options: {
      before?: { createdAt: Date; id: string } | null
      take: number
    }
  ) {
    const entries = await this.listMembers(organizationId)
    const after = options.before
      ? entries.filter((entry) => {
          const joinedAt = entry.joinedAt ?? new Date(0)
          return (
            joinedAt > options.before!.createdAt ||
            (joinedAt.getTime() === options.before!.createdAt.getTime() &&
              entry.userId > options.before!.id)
          )
        })
      : entries
    return after.slice(0, options.take)
  }

  async findMemberByEmail(organizationId: string, email: string) {
    return this.directory.findByEmail(organizationId, email)
  }
}
