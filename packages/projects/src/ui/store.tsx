"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { ProjectActionsProvider, type ProjectActions } from "./actions"
import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"
import type {
  CreateTaskInput,
  CreateTaskTemplateInput,
  UpdateTaskTemplateInput,
} from "../schemas"
import type {
  Activity,
  Comment,
  Label,
  Member,
  MemberRole,
  Project,
  ProjectData,
  ProjectStatus,
  Task,
  TaskPriority,
  TaskStatus,
  TaskTemplate,
} from "../types"
import { ACTIVITY_STATUS_SENTINEL } from "../types"

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function projectKey(name: string, tasks: Task[]) {
  const base = name
    .replace(/[^a-zA-Z ]/g, "")
    .split(" ")
    .map((word) => word && word[0])
    .join("")
    .toUpperCase()
    .slice(0, 3)
  const count = tasks.filter((task) => task.identifier.startsWith(base)).length
  return `${base || "TSK"}-${count + 1}`
}

export type { CreateTaskInput }
export type { ProjectActions }

export interface CreateProjectInput {
  name: string
  description?: string
  status?: ProjectStatus
  memberIds?: string[]
  labelIds?: string[]
}

interface ProjectStore {
  projects: Project[]
  tasks: Task[]
  members: Member[]
  labels: Label[]
  activities: Activity[]
  currentUserId: string
  /** Owner/admin members may manage the member list, portal and repository. */
  canManageMembers: boolean
  tasksLoaded: boolean
  /** Load tasks + activity once, when a project/calendar screen needs them. */
  ensureProjectData: () => void
  /** Fetch tasks + activity again after a change made outside the store. */
  reloadProjectData: () => void
  getProject: (id: string) => Project | undefined
  getMember: (id?: string) => Member | undefined
  getLabel: (id: string) => Label | undefined
  tasksForProject: (projectId: string) => Task[]
  activitiesForProject: (projectId: string) => Activity[]
  createProject: (input: CreateProjectInput) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  createTask: (input: CreateTaskInput) => void
  updateTask: (
    id: string,
    patch: Omit<
      Partial<Task>,
      "labelIds" | "dueDate" | "endDate" | "assigneeId"
    > & {
      labelIds?: string[]
      dueDate?: string | null
      endDate?: string | null
      assigneeId?: string | null
    },
    options?: { silent?: boolean }
  ) => void
  moveTask: (id: string, status: TaskStatus) => void
  deleteTask: (id: string) => void
  toggleSubtask: (taskId: string, subtaskId: string) => void
  addComment: (taskId: string, authorId: string, body: string) => void
  addMember: (input: { name: string; email: string; role: MemberRole }) => void
  updateMemberRole: (id: string, role: MemberRole) => void
  removeMember: (id: string) => void
  addLabel: (name: string, color: string) => void
  removeLabel: (id: string) => void
  templates: TaskTemplate[]
  templatesForProject: (projectId: string) => TaskTemplate[]
  createTemplate: (input: CreateTaskTemplateInput) => void
  updateTemplate: (id: string, input: UpdateTaskTemplateInput) => void
  removeTemplate: (id: string) => void
}

const ProjectStoreContext = React.createContext<ProjectStore | null>(null)

export function ProjectStoreProvider({
  children,
  initialData,
  currentUserId,
  actions,
  canManageMembers,
}: {
  children: React.ReactNode
  initialData: ProjectData
  currentUserId: string
  actions: ProjectActions
  canManageMembers: boolean
}) {
  const t = useTranslations("Toasts")
  const te = useErrorTranslator()
  const [projects, setProjects] = React.useState<Project[]>(
    initialData.projects
  )
  const [tasks, setTasks] = React.useState<Task[]>(initialData.tasks)
  const [members, setMembers] = React.useState<Member[]>(initialData.members)
  const [labels, setLabels] = React.useState<Label[]>(initialData.labels)
  const [templates, setTemplates] = React.useState<TaskTemplate[]>(
    initialData.templates
  )
  const [activities, setActivities] = React.useState<Activity[]>(
    initialData.activities
  )
  const [tasksLoaded, setTasksLoaded] = React.useState(
    initialData.tasks.length > 0 || initialData.activities.length > 0
  )
  const tasksLoadedRef = React.useRef(tasksLoaded)

  React.useEffect(() => {
    if (initialData.projects.length === 0) {
      void actions
        .listShell()
        .then((result) => {
          const data = unwrapActionResult(result)
          setProjects((prev) => (prev.length > 0 ? prev : data.projects))
          setMembers((prev) => (prev.length > 0 ? prev : data.members))
          setLabels((prev) => (prev.length > 0 ? prev : data.labels))
          setTemplates((prev) => (prev.length > 0 ? prev : data.templates))
        })
        .catch(() => {})
    }
  }, [initialData.projects.length])

  React.useEffect(() => {
    if (initialData.projects.length > 0) setProjects(initialData.projects)
    if (initialData.members.length > 0) setMembers(initialData.members)
    if (initialData.labels.length > 0) setLabels(initialData.labels)
    if (initialData.templates.length > 0) setTemplates(initialData.templates)
    // The layout only sends shell data. Keep what the feature already loaded
    // instead of wiping it on every server refresh.
    if (!tasksLoadedRef.current) {
      setTasks(initialData.tasks)
      setActivities(initialData.activities)
    }
  }, [initialData])

  const ensureProjectData = React.useCallback(() => {
    if (tasksLoadedRef.current) return
    tasksLoadedRef.current = true
    setTasksLoaded(true)
    void actions
      .loadWorkspace()
      .then((result) => {
        const data = unwrapActionResult(result)
        setTasks(data.tasks)
        setActivities(data.activities)
      })
      .catch(() => {
        tasksLoadedRef.current = false
        setTasksLoaded(false)
      })
  }, [])

  const reloadProjectData = React.useCallback(() => {
    tasksLoadedRef.current = false
    ensureProjectData()
  }, [ensureProjectData])

  const pushActivity = React.useCallback(
    (projectId: string, action: string, target: string) => {
      setActivities((prev) => [
        {
          id: uid("a"),
          projectId,
          actorId: currentUserId,
          action,
          target,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ])
    },
    [currentUserId]
  )

  const store = React.useMemo<ProjectStore>(() => {
    const getProject = (id: string) => projects.find((p) => p.id === id)
    const getMember = (id?: string) =>
      id ? members.find((m) => m.id === id) : undefined
    const getLabel = (id: string) => labels.find((l) => l.id === id)

    return {
      projects,
      tasks,
      members,
      labels,
      templates,
      activities,
      currentUserId,
      canManageMembers,
      tasksLoaded,
      ensureProjectData,
      reloadProjectData,
      getProject,
      getMember,
      getLabel,
      tasksForProject: (projectId) =>
        tasks.filter((task) => task.projectId === projectId),
      templatesForProject: (projectId) =>
        templates.filter((template) => template.projectId === projectId),
      activitiesForProject: (projectId) =>
        activities.filter((activity) => activity.projectId === projectId),
      createProject: (input) => {
        const optimistic: Project = {
          id: uid("p"),
          name: input.name,
          description: input.description,
          status: input.status ?? "active",
          clientVisible: true,
          clientDiscussion: "read_write",
          clientTaskComments: "read_write",
          isBillable: true,
          memberIds: input.memberIds?.length
            ? input.memberIds
            : [currentUserId],
          labelIds: input.labelIds ?? [],
          createdAt: new Date().toISOString(),
        }
        setProjects((prev) => [optimistic, ...prev])
        void actions
          .createProject(input)
          .then((result) => {
            const project = unwrapActionResult(result)
            setProjects((prev) =>
              prev.some((item) => item.id === optimistic.id)
                ? prev.map((item) =>
                    item.id === optimistic.id ? project : item
                  )
                : [project, ...prev]
            )
            toast.success(t("projectCreated", { name: project.name }))
          })
          .catch((error) => {
            setProjects((prev) =>
              prev.filter((item) => item.id !== optimistic.id)
            )
            toast.error(te(error, "createProjectFailed"))
          })
      },
      updateProject: (id, patch) => {
        setProjects((prev) =>
          prev.map((project) =>
            project.id === id ? { ...project, ...patch } : project
          )
        )
        void actions
          .updateProject(id, patch)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("projectUpdated"))
          })
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
      deleteProject: (id) => {
        setProjects((prev) => prev.filter((project) => project.id !== id))
        setTasks((prev) => prev.filter((task) => task.projectId !== id))
        setTemplates((prev) =>
          prev.filter((template) => template.projectId !== id)
        )
        setActivities((prev) =>
          prev.filter((activity) => activity.projectId !== id)
        )
        void actions
          .deleteProject(id)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("projectDeleted"))
          })
          .catch((error) => toast.error(te(error, "deleteFailed")))
      },
      createTask: (input) => {
        const project = getProject(input.projectId)
        const optimistic: Task = {
          id: uid("t"),
          identifier: projectKey(project?.name ?? "Task", tasks),
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          status: input.status ?? "todo",
          priority: input.priority ?? "medium",
          assigneeId: input.assigneeId ?? undefined,
          labelIds: input.labelIds ?? [],
          dueDate: input.dueDate ?? undefined,
          endDate: input.endDate ?? undefined,
          templateId: input.templateId ?? undefined,
          customFields: input.customFields ?? {},
          createdAt: new Date().toISOString(),
          subtasks: [],
          comments: [],
        }
        setTasks((prev) => [optimistic, ...prev])
        void actions
          .createTask({
            ...input,
            status: input.status ?? "todo",
            priority: input.priority ?? "medium",
            labelIds: input.labelIds ?? [],
          })
          .then((result) => {
            const task = unwrapActionResult(result)
            setTasks((prev) =>
              prev.map((item) => (item.id === optimistic.id ? task : item))
            )
            toast.success(t("taskCreated", { identifier: task.identifier }))
          })
          .catch((error) => {
            setTasks((prev) => prev.filter((item) => item.id !== optimistic.id))
            toast.error(te(error, "createTaskFailed"))
          })
        pushActivity(input.projectId, "created", optimistic.identifier)
      },
      updateTask: (id, patch, options) => {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === id
              ? {
                  ...task,
                  ...patch,
                  assigneeId: patch.assigneeId ?? undefined,
                  dueDate: patch.dueDate ?? undefined,
                  endDate: patch.endDate ?? undefined,
                }
              : task
          )
        )
        void actions
          .updateTask(id, patch)
          .then((result) => {
            unwrapActionResult(result)
            if (!options?.silent) toast.success(t("taskUpdated"))
          })
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
      moveTask: (id, status) => {
        const task = tasks.find((t) => t.id === id)
        if (!task || task.status === status) return
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status } : t))
        )
        pushActivity(
          task.projectId,
          "moved",
          `${task.identifier}${ACTIVITY_STATUS_SENTINEL}${status}`
        )
        void actions
          .moveTask(id, { status })
          .catch((error) => toast.error(te(error, "moveFailed")))
      },
      deleteTask: (id) => {
        const task = tasks.find((t) => t.id === id)
        setTasks((prev) => prev.filter((t) => t.id !== id))
        if (task) pushActivity(task.projectId, "deleted", task.identifier)
        void actions
          .deleteTask(id)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("taskDeleted"))
          })
          .catch((error) => toast.error(te(error, "deleteFailed")))
      },
      toggleSubtask: (taskId, subtaskId) => {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  subtasks: task.subtasks.map((subtask) =>
                    subtask.id === subtaskId
                      ? { ...subtask, done: !subtask.done }
                      : subtask
                  ),
                }
              : task
          )
        )
        void actions
          .toggleSubtask(taskId, subtaskId)
          .then((result) => unwrapActionResult(result))
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
      addComment: (taskId, _authorId, body) => {
        const comment: Comment = {
          id: uid("c"),
          authorId: currentUserId,
          authorKind: "internal",
          body,
          createdAt: new Date().toISOString(),
        }
        setTasks((prev) =>
          prev.map((task) =>
            task.id === taskId
              ? { ...task, comments: [...task.comments, comment] }
              : task
          )
        )
        const task = tasks.find((t) => t.id === taskId)
        if (task) pushActivity(task.projectId, "commentedOn", task.identifier)
        void actions
          .addComment(taskId, body)
          .then((result) => unwrapActionResult(result))
          .catch((error) => toast.error(te(error, "commentFailed")))
      },
      addMember: (input) => {
        const optimistic: Member = {
          id: uid("u"),
          name: input.name,
          email: input.email,
          role: input.role,
          roles: [input.role],
        }
        setMembers((prev) => [...prev, optimistic])
        void actions
          .addMember(input)
          .then((result) => {
            const member = unwrapActionResult(result)
            setMembers((prev) =>
              prev.map((item) => (item.id === optimistic.id ? member : item))
            )
            toast.success(t("memberAdded", { name: member.name }))
          })
          .catch((error) => {
            setMembers((prev) =>
              prev.filter((item) => item.id !== optimistic.id)
            )
            toast.error(te(error, "addMemberFailed"))
          })
      },
      updateMemberRole: (id, role) => {
        setMembers((prev) =>
          prev.map((member) =>
            member.id === id ? { ...member, role } : member
          )
        )
        void actions
          .updateMemberRole(id, { role })
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("roleUpdated"))
          })
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
      removeMember: (id) => {
        setMembers((prev) => prev.filter((member) => member.id !== id))
        setProjects((prev) =>
          prev.map((project) => ({
            ...project,
            memberIds: project.memberIds.filter((memberId) => memberId !== id),
          }))
        )
        void actions
          .removeMember(id)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("memberRemoved"))
          })
          .catch((error) => toast.error(te(error, "removeFailed")))
      },
      addLabel: (name, color) => {
        const optimistic: Label = { id: uid("l"), name, color }
        setLabels((prev) => [...prev, optimistic])
        void actions
          .addLabel({ name, color })
          .then((result) => {
            const label = unwrapActionResult(result)
            setLabels((prev) =>
              prev.map((item) => (item.id === optimistic.id ? label : item))
            )
            toast.success(t("labelCreated", { name }))
          })
          .catch((error) => {
            setLabels((prev) =>
              prev.filter((item) => item.id !== optimistic.id)
            )
            toast.error(te(error, "addLabelFailed"))
          })
      },
      removeLabel: (id) => {
        setLabels((prev) => prev.filter((label) => label.id !== id))
        setTasks((prev) =>
          prev.map((task) => ({
            ...task,
            labelIds: task.labelIds.filter((labelId) => labelId !== id),
          }))
        )
        void actions
          .removeLabel(id)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("labelDeleted"))
          })
          .catch((error) => toast.error(te(error, "deleteFailed")))
      },
      createTemplate: (input) => {
        const optimistic: TaskTemplate = {
          id: uid("tt"),
          projectId: input.projectId,
          name: input.name,
          description: input.description,
          status: input.status ?? "todo",
          priority: input.priority ?? "medium",
          labelIds: input.labelIds ?? [],
          fields: input.fields ?? [],
        }
        setTemplates((prev) => [...prev, optimistic])
        void actions
          .createTemplate(input)
          .then((result) => {
            const template = unwrapActionResult(result)
            setTemplates((prev) =>
              prev.map((item) => (item.id === optimistic.id ? template : item))
            )
            toast.success(t("templateCreated", { name: template.name }))
          })
          .catch((error) => {
            setTemplates((prev) =>
              prev.filter((item) => item.id !== optimistic.id)
            )
            toast.error(te(error, "createTemplateFailed"))
          })
      },
      updateTemplate: (id, input) => {
        setTemplates((prev) =>
          prev.map((template) =>
            template.id === id
              ? {
                  ...template,
                  ...input,
                  description: input.description ?? undefined,
                  fields: input.fields ?? template.fields,
                }
              : template
          )
        )
        void actions
          .updateTemplate(id, input)
          .then((result) => {
            const template = unwrapActionResult(result)
            setTemplates((prev) =>
              prev.map((item) => (item.id === id ? template : item))
            )
            toast.success(t("templateUpdated"))
          })
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
      removeTemplate: (id) => {
        setTemplates((prev) => prev.filter((template) => template.id !== id))
        void actions
          .removeTemplate(id)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("templateDeleted"))
          })
          .catch((error) => toast.error(te(error, "deleteFailed")))
      },
    }
  }, [
    projects,
    tasks,
    members,
    labels,
    templates,
    activities,
    currentUserId,
    canManageMembers,
    tasksLoaded,
    ensureProjectData,
    pushActivity,
  ])

  return (
    <ProjectActionsProvider actions={actions}>
      <ProjectStoreContext.Provider value={store}>
        {children}
      </ProjectStoreContext.Provider>
    </ProjectActionsProvider>
  )
}

export function useProjectStore() {
  const context = React.useContext(ProjectStoreContext)
  if (!context) {
    throw new Error(
      "useProjectStore must be used within a ProjectStoreProvider"
    )
  }
  return context
}

export { initialsFor }
export type { TaskPriority, TaskStatus }
