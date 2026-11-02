import { z } from "zod"

import { getRequestContext } from "@/lib/core/auth-context"
import { callDomain, delegatedContext } from "@/lib/internal/domain"
import type { RequestContext } from "@workspace/core/context"
import {
  createProjectSchema,
  createTaskSchema,
  moveTaskSchema,
  updateTaskSchema,
} from "@workspace/projects/schemas"

export interface McpTool {
  name: string
  title: string
  description: string
  inputSchema: z.ZodRawShape
  readOnly: boolean
  run: (ctx: RequestContext, input: Record<string, unknown>) => Promise<unknown>
}

const result = z.unknown()

function call(
  ctx: RequestContext,
  operation:
    | "list-projects"
    | "get-project"
    | "list-tasks"
    | "create-project"
    | "create-task"
    | "update-task"
    | "move-task",
  input: unknown
) {
  return callDomain("projects", operation, delegatedContext(ctx), input, result)
}

export const projectTools: McpTool[] = [
  {
    name: "list_projects",
    title: "List projects",
    description:
      "List all projects in the workspace, including their tasks, members and labels.",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => call(ctx, "list-projects", {}),
  },
  {
    name: "get_project",
    title: "Get project",
    description: "Fetch a single project by its id.",
    inputSchema: { projectId: z.string().describe("The project id") },
    readOnly: true,
    run: (ctx, input) =>
      call(ctx, "get-project", { projectId: String(input.projectId) }),
  },
  {
    name: "list_tasks",
    title: "List tasks",
    description: "List the tasks that belong to a project.",
    inputSchema: { projectId: z.string().describe("The project id") },
    readOnly: true,
    run: (ctx, input) =>
      call(ctx, "list-tasks", { projectId: String(input.projectId) }),
  },
  {
    name: "create_project",
    title: "Create project",
    description: "Create a new project in the workspace.",
    inputSchema: createProjectSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "create-project", createProjectSchema.parse(input)),
  },
  {
    name: "create_task",
    title: "Create task",
    description:
      "Create a task within a project. Set `createIssue` to false to keep the task out of the project's connected repository (no issue, no pull request).",
    inputSchema: createTaskSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "create-task", createTaskSchema.parse(input)),
  },
  {
    name: "update_task",
    title: "Update task",
    description: "Update a task's title, status, priority or assignee.",
    inputSchema: {
      taskId: z.string().describe("The task id"),
      ...updateTaskSchema.shape,
    },
    readOnly: false,
    run: (ctx, input) => {
      const { taskId, ...patch } = input
      return call(ctx, "update-task", {
        taskId: String(taskId),
        ...updateTaskSchema.parse(patch),
      })
    },
  },
  {
    name: "move_task",
    title: "Move task",
    description: "Move a task to a different status column.",
    inputSchema: {
      taskId: z.string().describe("The task id"),
      ...moveTaskSchema.shape,
    },
    readOnly: false,
    run: (ctx, input) => {
      const { taskId, ...rest } = input
      return call(ctx, "move-task", {
        taskId: String(taskId),
        ...moveTaskSchema.parse(rest),
      })
    },
  },
]

export { getRequestContext }
