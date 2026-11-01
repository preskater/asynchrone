"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"
import { revalidateOrgPath } from "@/lib/organization/paths"
import { projectService } from "@/lib/projects"
import {
  addCommentSchema,
  addLabelSchema,
  addMemberSchema,
  createProjectSchema,
  createTaskSchema,
  createTaskTemplateSchema,
  moveTaskSchema,
  updateMemberRoleSchema,
  updateProjectClientSettingsSchema,
  updateProjectSchema,
  updateTaskSchema,
  updateTaskTemplateSchema,
} from "@/lib/projects/schemas"

export const listProjectsAction = withAction(async () => {
  const ctx = await getRequestContext()
  return projectService.list(ctx)
})

/** Projects, members, labels and templates for the workspace shell. */
export const listProjectShellAction = withAction(async () => {
  const ctx = await getRequestContext()
  return projectService.listShell(ctx)
})

/** Tasks and the latest activity feed for the projects/calendar features. */
export const loadProjectWorkspaceAction = withAction(async () => {
  const ctx = await getRequestContext()
  return projectService.listWorkspace(ctx)
})

export const listProjectActivitiesAction = withAction(
  async (input?: { cursor?: string | null; projectId?: string }) => {
    const ctx = await getRequestContext()
    return projectService.listActivities(ctx, input)
  }
)

export const createProjectAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(createProjectSchema, input)
  const project = await projectService.create(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/projects")
  await revalidateOrgPath(ctx.organizationId)
  return project
})

export const updateProjectAction = withAction(
  async (id: string, input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(updateProjectSchema, input)
    const project = await projectService.update(ctx, id, parsed)
    await revalidateOrgPath(ctx.organizationId, "/projects")
    await revalidateOrgPath(ctx.organizationId, `/projects/${id}`)
    return project
  }
)

export const deleteProjectAction = withAction(async (id: string) => {
  const ctx = await getRequestContext()
  const result = await projectService.remove(ctx, id)
  await revalidateOrgPath(ctx.organizationId, "/projects")
  await revalidateOrgPath(ctx.organizationId)
  return result
})

/** Client-portal visibility and contribution policies of a project. */
export const updateProjectClientSettingsAction = withAction(
  async (input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(updateProjectClientSettingsSchema, input)
    const project = await projectService.updateClientSettings(ctx, parsed)
    await revalidateOrgPath(ctx.organizationId, `/projects/${parsed.projectId}`)
    return project
  }
)

export const createTaskAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(createTaskSchema, input)
  const task = await projectService.createTask(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, `/projects/${parsed.projectId}`)
  await revalidateOrgPath(ctx.organizationId)
  return task
})

export const updateTaskAction = withAction(async (id: string, input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(updateTaskSchema, input)
  const task = await projectService.updateTask(ctx, id, parsed)
  await revalidateOrgPath(ctx.organizationId, `/projects/${task.projectId}`)
  return task
})

export const moveTaskAction = withAction(async (id: string, status: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(moveTaskSchema, status)
  const task = await projectService.moveTask(ctx, id, parsed)
  await revalidateOrgPath(ctx.organizationId, `/projects/${task.projectId}`)
  return task
})

export const deleteTaskAction = withAction(async (id: string) => {
  const ctx = await getRequestContext()
  const result = await projectService.removeTask(ctx, id)
  await revalidateOrgPath(ctx.organizationId)
  return result
})

export const toggleSubtaskAction = withAction(
  async (taskId: string, subtaskId: string) => {
    const ctx = await getRequestContext()
    const task = await projectService.toggleSubtask(ctx, taskId, subtaskId)
    await revalidateOrgPath(ctx.organizationId, `/projects/${task.projectId}`)
    return task
  }
)

export const addCommentAction = withAction(
  async (taskId: string, body: string) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(addCommentSchema, { body })
    const task = await projectService.addComment(ctx, taskId, parsed)
    await revalidateOrgPath(ctx.organizationId, `/projects/${task.projectId}`)
    return task
  }
)

export const listMembersAction = withAction(async () => {
  const ctx = await getRequestContext()
  return projectService.listMembers(ctx)
})

export const listMembersPageAction = withAction(
  async (cursor?: string | null) => {
    const ctx = await getRequestContext()
    return projectService.listMembersPage(ctx, { cursor })
  }
)

export const addMemberAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(addMemberSchema, input)
  const member = await projectService.addMember(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/settings")
  return member
})

export const updateMemberRoleAction = withAction(
  async (userId: string, role: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(updateMemberRoleSchema, role)
    const member = await projectService.updateMemberRole(ctx, userId, parsed)
    await revalidateOrgPath(ctx.organizationId, "/settings")
    return member
  }
)

export const removeMemberAction = withAction(async (userId: string) => {
  const ctx = await getRequestContext()
  const result = await projectService.removeMember(ctx, userId)
  await revalidateOrgPath(ctx.organizationId, "/settings")
  return result
})

export const listLabelsAction = withAction(async () => {
  const ctx = await getRequestContext()
  return projectService.listLabels(ctx)
})

export const addLabelAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(addLabelSchema, input)
  const label = await projectService.addLabel(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/projects")
  return label
})

export const removeLabelAction = withAction(async (id: string) => {
  const ctx = await getRequestContext()
  const result = await projectService.removeLabel(ctx, id)
  await revalidateOrgPath(ctx.organizationId, "/projects")
  return result
})

export const createTaskTemplateAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(createTaskTemplateSchema, input)
  const template = await projectService.createTemplate(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, `/projects/${parsed.projectId}`)
  await revalidateOrgPath(ctx.organizationId)
  return template
})

export const updateTaskTemplateAction = withAction(
  async (id: string, input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(updateTaskTemplateSchema, input)
    const template = await projectService.updateTemplate(ctx, id, parsed)
    await revalidateOrgPath(ctx.organizationId, `/projects/${template.projectId}`)
    return template
  }
)

export const removeTaskTemplateAction = withAction(async (id: string) => {
  const ctx = await getRequestContext()
  const result = await projectService.removeTemplate(ctx, id)
  await revalidateOrgPath(ctx.organizationId)
  return result
})
