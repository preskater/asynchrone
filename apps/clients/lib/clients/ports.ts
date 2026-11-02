import { z } from "zod"

import type { RequestContext } from "@workspace/core/context"
import type {
  ClientFiles,
  ClientProjects,
} from "@workspace/clients/ports"

import { callDomain, delegatedContext } from "@/lib/internal/domain-client"

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable().optional(),
})

const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  trashed: z.boolean(),
  modifiedAt: z.string().optional(),
})

type Project = z.infer<typeof projectSchema>
type File = z.infer<typeof fileSchema>

/** Project reads and the link write, through the projects internal API. */
export const clientProjects: ClientProjects = {
  async countsByClient(ctx: RequestContext) {
    try {
      return await callDomain(
        "projects",
        "count-projects-by-client",
        delegatedContext(ctx),
        {},
        z.array(
          z.object({ clientId: z.string().nullable(), count: z.number() })
        )
      )
    } catch (error) {
      console.error("[clients] project counters unavailable", error)
      return []
    }
  },
  async countForClient(ctx, clientId) {
    try {
      return await callDomain(
        "projects",
        "count-client-projects",
        delegatedContext(ctx),
        { clientId },
        z.number()
      )
    } catch (error) {
      console.error("[clients] project count unavailable", error)
      return 0
    }
  },
  async listOptions(ctx) {
    try {
      return await callDomain(
        "projects",
        "list-project-options",
        delegatedContext(ctx),
        {},
        z.array(projectSchema)
      )
    } catch (error) {
      console.error("[clients] project options unavailable", error)
      return []
    }
  },
  async listLinkOptions(ctx) {
    try {
      return await callDomain(
        "projects",
        "list-project-options",
        delegatedContext(ctx),
        {},
        z.array(projectSchema)
      )
    } catch (error) {
      console.error("[clients] project link options unavailable", error)
      return []
    }
  },
  async listForClient(ctx, clientId) {
    try {
      return await callDomain(
        "projects",
        "list-client-projects",
        delegatedContext(ctx),
        { clientId },
        z.array(projectSchema)
      )
    } catch (error) {
      console.error("[clients] linked projects unavailable", error)
      return []
    }
  },
  async find(ctx, id) {
    try {
      const projects = await callDomain(
        "projects",
        "list-project-options",
        delegatedContext(ctx),
        {},
        z.array(projectSchema)
      )
      return projects.find((project) => project.id === id) ?? null
    } catch (error) {
      console.error("[clients] project lookup unavailable", error)
      return null
    }
  },
  setClient(ctx, id, clientId) {
    return callDomain(
      "projects",
      "set-project-client",
      delegatedContext(ctx),
      { projectId: id, clientId },
      projectSchema,
      { idempotencyKey: `project-client:${id}:${clientId ?? "none"}` }
    )
  },
}

/** File metadata for document links, through the files internal API. */
export const clientFiles: ClientFiles = {
  async find(ctx, id) {
    try {
      return await callDomain(
        "files",
        "find-file",
        delegatedContext(ctx),
        { fileId: id },
        fileSchema.nullable()
      )
    } catch (error) {
      console.error("[clients] file lookup unavailable", error)
      return null
    }
  },
  async byIds(ctx, ids) {
    try {
      return await callDomain(
        "files",
        "find-files-by-ids",
        delegatedContext(ctx),
        { ids },
        z.array(fileSchema)
      )
    } catch (error) {
      console.error("[clients] file metadata unavailable", error)
      return []
    }
  },
  async listOptions(ctx) {
    try {
      return await callDomain(
        "files",
        "list-file-options",
        delegatedContext(ctx),
        {},
        z.array(fileSchema)
      )
    } catch (error) {
      console.error("[clients] file options unavailable", error)
      return []
    }
  },
}

export type { File, Project }
