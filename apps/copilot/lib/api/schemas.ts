import { z } from "zod"

import { createTaskSchema, updateTaskSchema } from "@workspace/projects/schemas"
import { MemberRoleSchema } from "@workspace/contracts"

/**
 * The `/api/v1` contract (ADR 0042). Response schemas are objects without
 * `.passthrough()`, so parsing a domain payload through them also strips every
 * field the public API does not promise (comments, subtasks, portal policies).
 */

export const ApiLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
})

export const ApiProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.string(),
  labels: z.array(ApiLabelSchema),
  createdAt: z.string(),
})

export const ApiTaskSchema = z.object({
  id: z.string(),
  identifier: z.string().describe('Native key, e.g. "AB-123"'),
  projectId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.string(),
  priority: z.string(),
  assigneeId: z.string().optional().describe("User id of the assignee"),
  labelIds: z.array(z.string()),
  dueDate: z.string().optional(),
  endDate: z.string().optional(),
  externalIssueUrl: z.string().optional(),
  createdAt: z.string(),
  url: z.string().optional().describe("Link to the task in the projects app"),
})

export const ApiMemberSchema = z.object({
  id: z.string().describe("User id, usable as a task assigneeId"),
  name: z.string(),
  email: z.string(),
  roles: z.array(MemberRoleSchema),
})

export const ApiTokenInfoSchema = z.object({
  prefix: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.string(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  organization: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
})

export const ListTasksQuerySchema = z.object({
  projectId: z.string().min(1),
})

export const CreateTaskBodySchema = createTaskSchema.extend({
  createIssue: z
    .boolean()
    .default(false)
    .describe(
      "Also open an issue in the project's connected repository. Off by default."
    ),
})

export const UpdateTaskBodySchema = updateTaskSchema

/** Domain payload of `list-project-shell`: only the fields read here. */
export const ProjectShellSchema = z.object({
  projects: z.array(
    ApiProjectSchema.omit({ labels: true }).extend({
      labelIds: z.array(z.string()),
    })
  ),
  labels: z.array(ApiLabelSchema),
})

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    details: z.unknown().optional(),
  }),
})
