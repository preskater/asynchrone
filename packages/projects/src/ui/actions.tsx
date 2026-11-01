"use client"

import * as React from "react"

import type { ActionResult } from "@workspace/core/action"

import type {
  ConnectRepositoryInput,
  ConnectRepositoryResult,
  RepositoryConnectionView,
  RepositorySyncSummary,
  UserRepositoryTokenStatus,
} from "../integrations/types"
import type {
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
} from "../schemas"
import type { ProjectMessageData } from "../thread"
import type {
  Activity,
  Label,
  Member,
  Project,
  ProjectData,
  Task,
  TaskTemplate,
} from "../types"

/**
 * The server actions of the owning app, injected into the UI.
 *
 * Server actions stay in `apps/copilot` (and move with `apps/projects` in #160),
 * so the package components cannot import them. The app passes this object to
 * `ProjectStoreProvider`; every component reaches it through
 * `useProjectActions()`.
 */
export interface ProjectActions {
  listShell(): Promise<ActionResult<ProjectData>>
  loadWorkspace(): Promise<
    ActionResult<{ tasks: Task[]; activities: Activity[] }>
  >
  createProject(input: CreateProjectInput): Promise<ActionResult<Project>>
  updateProject(
    id: string,
    input: UpdateProjectInput
  ): Promise<ActionResult<Project>>
  deleteProject(id: string): Promise<ActionResult<{ id: string }>>
  updateClientSettings(
    input: UpdateProjectClientSettingsInput
  ): Promise<ActionResult<Project>>
  createTask(input: CreateTaskInput): Promise<ActionResult<Task>>
  updateTask(id: string, input: UpdateTaskInput): Promise<ActionResult<Task>>
  moveTask(id: string, input: MoveTaskInput): Promise<ActionResult<Task>>
  deleteTask(id: string): Promise<ActionResult<{ id: string }>>
  toggleSubtask(taskId: string, subtaskId: string): Promise<ActionResult<Task>>
  addComment(taskId: string, body: string): Promise<ActionResult<Task>>
  addMember(input: AddMemberInput): Promise<ActionResult<Member>>
  updateMemberRole(
    id: string,
    input: UpdateMemberRoleInput
  ): Promise<ActionResult<Member>>
  removeMember(id: string): Promise<ActionResult<{ id: string }>>
  addLabel(input: AddLabelInput): Promise<ActionResult<Label>>
  removeLabel(id: string): Promise<ActionResult<{ id: string }>>
  createTemplate(
    input: CreateTaskTemplateInput
  ): Promise<ActionResult<TaskTemplate>>
  updateTemplate(
    id: string,
    input: UpdateTaskTemplateInput
  ): Promise<ActionResult<TaskTemplate>>
  removeTemplate(id: string): Promise<ActionResult<{ id: string }>>
  listMessages(projectId: string): Promise<ActionResult<ProjectMessageData[]>>
  postMessage(input: {
    projectId: string
    body: string
  }): Promise<ActionResult<ProjectMessageData>>
  getRepositoryConnection(
    projectId: string
  ): Promise<ActionResult<RepositoryConnectionView | null>>
  connectRepository(
    input: ConnectRepositoryInput
  ): Promise<ActionResult<ConnectRepositoryResult>>
  disconnectRepository(projectId: string): Promise<ActionResult<{ id: string }>>
  syncRepository(
    projectId: string
  ): Promise<ActionResult<RepositorySyncSummary>>
  listUserRepositoryTokens(): Promise<ActionResult<UserRepositoryTokenStatus>>
}

const ProjectActionsContext = React.createContext<ProjectActions | null>(null)

export function ProjectActionsProvider({
  actions,
  children,
}: {
  actions: ProjectActions
  children: React.ReactNode
}) {
  return (
    <ProjectActionsContext.Provider value={actions}>
      {children}
    </ProjectActionsContext.Provider>
  )
}

export function useProjectActions(): ProjectActions {
  const context = React.useContext(ProjectActionsContext)
  if (!context) {
    throw new Error(
      "useProjectActions must be used within a ProjectStoreProvider"
    )
  }
  return context
}
