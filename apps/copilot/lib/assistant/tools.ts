import { tool, type RunContext, type Tool } from "@openai/agents"
import { z } from "zod"

import { createEventSchema } from "@workspace/calendars/schemas"
import type { RequestContext } from "@workspace/core/context"
import { sendMessageSchema } from "@workspace/messaging/schemas"
import {
  createProjectSchema,
  createTaskSchema,
  moveTaskSchema,
  updateTaskSchema,
} from "@workspace/projects/schemas"

import { callDomain, delegatedContext } from "@/lib/internal/domain"

const empty = z.object({})
const idInput = z.object({ id: z.string().describe("The resource id") })
const result = z.unknown()

function ctxOf(context: RunContext<unknown> | undefined): RequestContext {
  if (!context) {
    throw new Error("Assistant tools require a run context.")
  }
  return context.context as RequestContext
}

export const assistantTools: Tool<RequestContext>[] = [
  tool({
    name: "list_projects",
    description:
      "List all projects in the workspace with their tasks, members and labels.",
    parameters: empty,
    execute: async (_input, context) =>
      callDomain(
        "projects",
        "list-projects",
        delegatedContext(ctxOf(context)),
        {},
        result
      ),
  }),
  tool({
    name: "get_project",
    description: "Fetch a single project by id.",
    parameters: idInput,
    execute: async ({ id }, context) =>
      callDomain(
        "projects",
        "get-project",
        delegatedContext(ctxOf(context)),
        { projectId: id },
        result
      ),
  }),
  tool({
    name: "list_tasks",
    description: "List the tasks belonging to a project.",
    parameters: createTaskSchema.pick({ projectId: true }),
    execute: async ({ projectId }, context) =>
      callDomain(
        "projects",
        "list-tasks",
        delegatedContext(ctxOf(context)),
        { projectId },
        result
      ),
  }),
  tool({
    name: "create_project",
    description: "Create a new project.",
    parameters: createProjectSchema,
    execute: async (input, context) =>
      callDomain(
        "projects",
        "create-project",
        delegatedContext(ctxOf(context)),
        input,
        result
      ),
  }),
  tool({
    name: "create_task",
    description: "Create a task inside a project.",
    parameters: createTaskSchema,
    execute: async (input, context) =>
      callDomain(
        "projects",
        "create-task",
        delegatedContext(ctxOf(context)),
        input,
        result
      ),
  }),
  tool({
    name: "update_task",
    description: "Update a task's title, status, priority or assignee.",
    parameters: updateTaskSchema.extend(idInput.shape),
    execute: async ({ id, ...patch }, context) =>
      callDomain(
        "projects",
        "update-task",
        delegatedContext(ctxOf(context)),
        { taskId: id, ...patch },
        result
      ),
  }),
  tool({
    name: "move_task",
    description: "Move a task to a different status column.",
    parameters: moveTaskSchema.extend(idInput.shape),
    execute: async ({ id, status }, context) =>
      callDomain(
        "projects",
        "move-task",
        delegatedContext(ctxOf(context)),
        { taskId: id, status },
        result
      ),
  }),
  tool({
    name: "list_calendar",
    description: "List workspace calendars and their events.",
    parameters: empty,
    execute: async (_input, context) =>
      callDomain(
        "calendars",
        "list-calendars",
        delegatedContext(ctxOf(context)),
        {},
        result
      ),
  }),
  tool({
    name: "create_event",
    description:
      "Schedule a calendar event. startAt/endAt are ISO timestamp strings.",
    parameters: createEventSchema,
    execute: async (input, context) =>
      callDomain(
        "calendars",
        "create-event",
        delegatedContext(ctxOf(context)),
        input,
        result
      ),
  }),
  tool({
    name: "list_files",
    description: "List files and folders in the workspace.",
    parameters: empty,
    execute: async (_input, context) =>
      callDomain(
        "files",
        "list-files",
        delegatedContext(ctxOf(context)),
        {},
        result
      ),
  }),
  tool({
    name: "list_conversations",
    description: "List workspace conversations and their messages.",
    parameters: empty,
    execute: async (_input, context) =>
      callDomain(
        "messages",
        "list-conversations",
        delegatedContext(ctxOf(context)),
        {},
        result
      ),
  }),
  tool({
    name: "send_message",
    description: "Send a message to a conversation.",
    parameters: sendMessageSchema,
    execute: async (input, context) =>
      callDomain(
        "messages",
        "send-message",
        delegatedContext(ctxOf(context)),
        input,
        result
      ),
  }),
]
