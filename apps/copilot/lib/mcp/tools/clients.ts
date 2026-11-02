import { z } from "zod"

import { callDomain, delegatedContext } from "@/lib/internal/domain"
import {
  activityInputSchema,
  clientInputSchema,
  contactInputSchema,
  dealInputSchema,
  linkDocumentSchema,
  linkProjectSchema,
  moveDealSchema,
  unlinkProjectSchema,
} from "@workspace/clients/schemas"

import type { McpTool } from "./projects"

const result = z.unknown()

function call(
  ctx: Parameters<McpTool["run"]>[0],
  operation:
    | "get-clients-overview"
    | "get-client"
    | "get-deal"
    | "save-client"
    | "save-contact"
    | "save-deal"
    | "move-deal"
    | "create-client-activity"
    | "list-client-documents"
    | "link-client-document"
    | "unlink-client-document"
    | "link-client-project"
    | "unlink-client-project",
  input: unknown
) {
  return callDomain("clients", operation, delegatedContext(ctx), input, result)
}

export const clientTools: McpTool[] = [
  {
    name: "get_clients_overview",
    title: "Get the Clients overview",
    description:
      "Get the client workspace: companies, contacts, pipelines with stages, deals (with status), recent activity and custom field definitions.",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => call(ctx, "get-clients-overview", {}),
  },
  {
    name: "get_client",
    title: "Get client",
    description:
      "Fetch one company with its contacts, deals, projects and activity timeline.",
    inputSchema: { clientId: z.string().describe("The company id") },
    readOnly: true,
    run: (ctx, input) =>
      call(ctx, "get-client", { id: String(input.clientId) }),
  },
  {
    name: "get_deal",
    title: "Get deal",
    description:
      "Fetch one deal with its timeline, contacts and pipeline configuration.",
    inputSchema: { dealId: z.string().describe("The deal id") },
    readOnly: true,
    run: (ctx, input) => call(ctx, "get-deal", { id: String(input.dealId) }),
  },
  {
    name: "save_client",
    title: "Create or update a company",
    description:
      "Create a company (without `id`) or update one (with `id`). Status is prospect | active | inactive.",
    inputSchema: clientInputSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "save-client", clientInputSchema.parse(input)),
  },
  {
    name: "save_contact",
    title: "Create or update a contact",
    description:
      "Create a contact (without `id`) or update one (with `id`). Link it to companies through `companies`.",
    inputSchema: contactInputSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "save-contact", contactInputSchema.parse(input)),
  },
  {
    name: "save_deal",
    title: "Create or update a deal",
    description:
      "Create a deal (without `id`) or update one (with `id`). Moving a deal to a won/lost stage updates its status automatically.",
    inputSchema: dealInputSchema.shape,
    readOnly: false,
    run: (ctx, input) => call(ctx, "save-deal", dealInputSchema.parse(input)),
  },
  {
    name: "move_deal",
    title: "Move a deal to another stage",
    description:
      "Move a deal to a pipeline stage at a given position. Ask for a loss reason when moving to a lost stage.",
    inputSchema: moveDealSchema.shape,
    readOnly: false,
    run: (ctx, input) => call(ctx, "move-deal", moveDealSchema.parse(input)),
  },
  {
    name: "log_client_activity",
    title: "Log a client activity",
    description:
      "Log a note, call, email or meeting on at least one company, contact or deal.",
    inputSchema: {
      type: z.enum(["note", "call", "email", "meeting"]).default("note"),
      subject: z.string().optional(),
      body: z.string().describe("The content of the entry"),
      occurredAt: z
        .string()
        .optional()
        .describe("ISO timestamp; defaults to now"),
      clientId: z.string().optional(),
      contactId: z.string().optional(),
      dealId: z.string().optional(),
    },
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "create-client-activity", activityInputSchema.parse(input)),
  },
  {
    name: "list_client_documents",
    title: "List documents of a client record",
    description:
      "List the files linked to a company, contact or deal (name, kind, visibility).",
    inputSchema: {
      entity: z.enum(["client", "contact", "deal"]),
      entityId: z.string(),
    },
    readOnly: true,
    run: (ctx, input) =>
      call(ctx, "list-client-documents", {
        entity: input.entity,
        entityId: String(input.entityId),
      }),
  },
  {
    name: "link_client_document",
    title: "Link a file to a client record",
    description:
      "Attach an existing file (from the Files section) to a company, contact or deal.",
    inputSchema: {
      entity: z.enum(["client", "contact", "deal"]),
      entityId: z.string(),
      fileId: z.string(),
      visibility: z.enum(["internal", "client"]).optional(),
    },
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "link-client-document", linkDocumentSchema.parse(input)),
  },
  {
    name: "unlink_client_document",
    title: "Unlink a document from a client record",
    description:
      "Remove the link between a file and a client record. The file itself stays in Files.",
    inputSchema: { documentId: z.string() },
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "unlink-client-document", { id: String(input.documentId) }),
  },
  {
    name: "link_client_project",
    title: "Link a project to a company",
    description:
      "Link an existing project to a company (client). If the project was linked to another company, it is re-linked to this one.",
    inputSchema: { clientId: z.string(), projectId: z.string() },
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "link-client-project", linkProjectSchema.parse(input)),
  },
  {
    name: "unlink_client_project",
    title: "Unlink a project from a company",
    description:
      "Remove the link between a project and a company. The project itself is kept.",
    inputSchema: { clientId: z.string(), projectId: z.string() },
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "unlink-client-project", unlinkProjectSchema.parse(input)),
  },
]
