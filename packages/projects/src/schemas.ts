import { z } from "zod"

import {
  CHOICE_FIELD_TYPES,
  PORTAL_POLICIES,
  TASK_TEMPLATE_FIELD_TYPES,
} from "./types"

export const portalPolicySchema = z.enum(PORTAL_POLICIES)

export const updateProjectClientSettingsSchema = z.object({
  projectId: z.string().min(1),
  clientVisible: z.boolean(),
  clientDiscussion: portalPolicySchema,
  clientTaskComments: portalPolicySchema,
})

export const taskStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
])

export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"])

export const projectStatusSchema = z.enum(["active", "paused", "completed"])

export const memberRoleSchema = z.enum(["owner", "admin", "member", "viewer"])

// The date picker sends ISO datetimes; API/assistant callers may send a day.
const dateInputSchema = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .nullable()
  .optional()

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  status: projectStatusSchema.optional(),
  memberIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional(),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: projectStatusSchema.optional(),
  memberIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional(),
  dueDate: dateInputSchema,
})

export const taskTemplateFieldSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().trim().min(1).max(120),
    type: z.enum(TASK_TEMPLATE_FIELD_TYPES),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  })
  .superRefine((field, ctx) => {
    if (CHOICE_FIELD_TYPES.includes(field.type) && field.options.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Choice fields need at least one option.",
      })
    }
  })

export const taskTemplateFieldsSchema = z.array(taskTemplateFieldSchema).max(20)

export const taskCustomFieldsSchema = z.record(
  z.string().min(1).max(64),
  z.union([z.string().max(2000), z.array(z.string().max(200)).max(30)])
)

export const createTaskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(240),
  description: z.string().max(5000).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: z.string().nullable().optional(),
  labelIds: z.array(z.string()).optional(),
  dueDate: dateInputSchema,
  endDate: dateInputSchema,
  templateId: z.string().min(1).nullable().optional(),
  customFields: taskCustomFieldsSchema.optional(),
  /**
   * Whether to create an issue in the project's connected repository.
   * Defaults to `true`; only meaningful for projects with a repository.
   */
  createIssue: z.boolean().optional(),
})

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: z.string().nullable().optional(),
  labelIds: z.array(z.string()).optional(),
  dueDate: dateInputSchema,
  endDate: dateInputSchema,
  customFields: taskCustomFieldsSchema.optional(),
})

export const createTaskTemplateSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(5000).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  labelIds: z.array(z.string()).optional(),
  fields: taskTemplateFieldsSchema.optional(),
})

export const updateTaskTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  labelIds: z.array(z.string()).optional(),
  fields: taskTemplateFieldsSchema.optional(),
})

export const moveTaskSchema = z.object({
  status: taskStatusSchema,
})

export const addCommentSchema = z.object({
  body: z.string().min(1).max(4000),
})

export const addMemberSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.email(),
  role: memberRoleSchema,
})

export const updateMemberRoleSchema = z.object({
  role: memberRoleSchema,
})

export const addLabelSchema = z.object({
  name: z.string().min(1).max(60),
  color: z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Enter a valid hex color.")
    .transform((value) => value.toLowerCase()),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
export type UpdateProjectClientSettingsInput = z.infer<
  typeof updateProjectClientSettingsSchema
>
export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
export type MoveTaskInput = z.infer<typeof moveTaskSchema>
export type AddCommentInput = z.infer<typeof addCommentSchema>
export type AddMemberInput = z.infer<typeof addMemberSchema>
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>
export type AddLabelInput = z.infer<typeof addLabelSchema>
export type CreateTaskTemplateInput = z.infer<typeof createTaskTemplateSchema>
export type UpdateTaskTemplateInput = z.infer<typeof updateTaskTemplateSchema>
export type TaskTemplateFieldInput = z.infer<typeof taskTemplateFieldSchema>
