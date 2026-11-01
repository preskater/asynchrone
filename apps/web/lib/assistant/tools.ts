import { tool, type RunContext, type Tool } from "@openai/agents"
import { z } from "zod"

import { calendarService } from "@/lib/calendars"
import { createEventSchema } from "@workspace/calendars/schemas"
import type { RequestContext } from "@workspace/core/context"
import { fileService } from "@/lib/files"
import { messagingService } from "@/lib/messaging"
import { sendMessageSchema } from "@/lib/messaging/schemas"
import { projectService } from "@/lib/projects"
import {
  createProjectSchema,
  createTaskSchema,
  moveTaskSchema,
  updateTaskSchema,
} from "@workspace/projects/schemas"

const empty = z.object({})
const idInput = z.object({ id: z.string().describe("The resource id") })

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
    execute: async (_input, context) => projectService.list(ctxOf(context)),
  }),
  tool({
    name: "get_project",
    description: "Fetch a single project by id.",
    parameters: idInput,
    execute: async ({ id }, context) => projectService.get(ctxOf(context), id),
  }),
  tool({
    name: "list_tasks",
    description: "List the tasks belonging to a project.",
    parameters: createTaskSchema.pick({ projectId: true }),
    execute: async ({ projectId }, context) =>
      projectService.listTasks(ctxOf(context), projectId),
  }),
  tool({
    name: "create_project",
    description: "Create a new project.",
    parameters: createProjectSchema,
    execute: async (input, context) =>
      projectService.create(ctxOf(context), input),
  }),
  tool({
    name: "create_task",
    description: "Create a task inside a project.",
    parameters: createTaskSchema,
    execute: async (input, context) =>
      projectService.createTask(ctxOf(context), input),
  }),
  tool({
    name: "update_task",
    description: "Update a task's title, status, priority or assignee.",
    parameters: updateTaskSchema.extend(idInput.shape),
    execute: async ({ id, ...patch }, context) =>
      projectService.updateTask(ctxOf(context), id, patch),
  }),
  tool({
    name: "move_task",
    description: "Move a task to a different status column.",
    parameters: moveTaskSchema.extend(idInput.shape),
    execute: async ({ id, status }, context) =>
      projectService.moveTask(ctxOf(context), id, { status }),
  }),
  tool({
    name: "list_calendar",
    description: "List workspace calendars and their events.",
    parameters: empty,
    execute: async (_input, context) => calendarService.list(ctxOf(context)),
  }),
  tool({
    name: "create_event",
    description:
      "Schedule a calendar event. startAt/endAt are ISO timestamp strings.",
    parameters: createEventSchema,
    execute: async (input, context) =>
      calendarService.createEvent(ctxOf(context), input),
  }),
  tool({
    name: "list_files",
    description: "List files and folders in the workspace.",
    parameters: empty,
    execute: async (_input, context) => fileService.list(ctxOf(context)),
  }),
  tool({
    name: "list_conversations",
    description: "List workspace conversations and their messages.",
    parameters: empty,
    execute: async (_input, context) => messagingService.list(ctxOf(context)),
  }),
  tool({
    name: "send_message",
    description: "Send a message to a conversation.",
    parameters: sendMessageSchema,
    execute: async (input, context) =>
      messagingService.sendMessage(ctxOf(context), input),
  }),
]
