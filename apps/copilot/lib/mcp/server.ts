import type { AuthInfo, McpServer } from "@modelcontextprotocol/server"
import type * as z from "zod"

import { calendarTools } from "./tools/calendars"
import { clientTools } from "./tools/clients"
import { fileTools } from "./tools/files"
import { employeeTools } from "./tools/employees"
import { meetingTools } from "./tools/meetings"
import { messagingTools } from "./tools/messaging"
import { projectTools } from "./tools/projects"
import type { McpTool } from "./tools/projects"
import { contextFromAuthInfo } from "./context"

export const allMcpTools: McpTool[] = [
  ...projectTools,
  ...calendarTools,
  ...clientTools,
  ...employeeTools,
  ...meetingTools,
  ...fileTools,
  ...messagingTools,
]

function textResult(value: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(value, null, 2) },
    ],
    structuredContent: { data: value },
  }
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error"
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  }
}

export function registerTools(
  server: McpServer,
  authInfo: AuthInfo | undefined
) {
  for (const tool of allMcpTools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, z.ZodType>,
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: !tool.readOnly,
          idempotentHint: tool.readOnly,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          const ctx = contextFromAuthInfo(authInfo)
          const result = await tool.run(
            ctx,
            (args ?? {}) as Record<string, unknown>
          )
          return textResult(result)
        } catch (error) {
          return errorResult(error)
        }
      }
    )
  }
}
