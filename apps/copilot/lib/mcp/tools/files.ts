import { z } from "zod"

import { callDomain, delegatedContext } from "@/lib/internal/domain"
import {
  createFilesSchema,
  createFolderSchema,
  moveFileSchema,
  renameFileSchema,
} from "@workspace/files/schemas"

import type { McpTool } from "./projects"

const result = z.unknown()

function call(
  ctx: Parameters<McpTool["run"]>[0],
  operation:
    | "list-files"
    | "create-folder"
    | "create-files"
    | "rename-file"
    | "move-file"
    | "trash-file",
  input: unknown
) {
  return callDomain("files", operation, delegatedContext(ctx), input, result)
}

export const fileTools: McpTool[] = [
  {
    name: "list_files",
    title: "List files",
    description: "List all files and folders in the workspace.",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => call(ctx, "list-files", {}),
  },
  {
    name: "create_folder",
    title: "Create folder",
    description: "Create a new folder, optionally inside a parent folder.",
    inputSchema: createFolderSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "create-folder", createFolderSchema.parse(input)),
  },
  {
    name: "create_files",
    title: "Create files",
    description: "Create one or more files, optionally inside a parent folder.",
    inputSchema: createFilesSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "create-files", createFilesSchema.parse(input)),
  },
  {
    name: "rename_file",
    title: "Rename file",
    description: "Rename a file or folder.",
    inputSchema: { fileId: z.string(), ...renameFileSchema.shape },
    readOnly: false,
    run: (ctx, input) => {
      const { fileId, ...rest } = input
      return call(ctx, "rename-file", {
        fileId: String(fileId),
        ...renameFileSchema.parse(rest),
      })
    },
  },
  {
    name: "move_file",
    title: "Move file",
    description: "Move a file or folder into another folder (or root).",
    inputSchema: { fileId: z.string(), ...moveFileSchema.shape },
    readOnly: false,
    run: (ctx, input) => {
      const { fileId, ...rest } = input
      return call(ctx, "move-file", {
        fileId: String(fileId),
        ...moveFileSchema.parse(rest),
      })
    },
  },
  {
    name: "trash_file",
    title: "Move file to trash",
    description: "Move a file or folder to the trash.",
    inputSchema: { fileId: z.string() },
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "trash-file", { fileId: String(input.fileId) }),
  },
]
