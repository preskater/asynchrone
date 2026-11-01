import { z } from "zod"

import { clientsService } from "@/lib/clients"
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

export const clientTools: McpTool[] = [
  {
    name: "get_clients_overview",
    title: "Get the Clients overview",
    description:
      "Get the client workspace: companies, contacts, pipelines with stages, deals (with status), recent activity and custom field definitions.",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => clientsService.getOverview(ctx),
  },
  {
    name: "get_client",
    title: "Get client",
    description:
      "Fetch one company with its contacts, deals, projects and activity timeline.",
    inputSchema: { clientId: z.string().describe("The company id") },
    readOnly: true,
    run: (ctx, input) =>
      clientsService.getClientDetail(ctx, String(input.clientId)),
  },
  {
    name: "get_deal",
    title: "Get deal",
    description:
      "Fetch one deal with its timeline, contacts and pipeline configuration.",
    inputSchema: { dealId: z.string().describe("The deal id") },
    readOnly: true,
    run: (ctx, input) =>
      clientsService.getDealDetail(ctx, String(input.dealId)),
  },
  {
    name: "save_client",
    title: "Create or update a company",
    description:
      "Create a company (without `id`) or update one (with `id`). Status is prospect | active | inactive.",
    inputSchema: clientInputSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      clientsService.saveClient(ctx, clientInputSchema.parse(input)),
  },
  {
    name: "save_contact",
    title: "Create or update a contact",
    description:
      "Create a contact (without `id`) or update one (with `id`). Link it to companies through `companies`.",
    inputSchema: contactInputSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      clientsService.saveContact(ctx, contactInputSchema.parse(input)),
  },
  {
    name: "save_deal",
    title: "Create or update a deal",
    description:
      "Create a deal (without `id`) or update one (with `id`). Moving a deal to a won/lost stage updates its status automatically.",
    inputSchema: dealInputSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      clientsService.saveDeal(ctx, dealInputSchema.parse(input)),
  },
  {
    name: "move_deal",
    title: "Move a deal to another stage",
    description:
      "Move a deal to a pipeline stage at a given position. Ask for a loss reason when moving to a lost stage.",
    inputSchema: moveDealSchema.shape,
    readOnly: false,
    run: (ctx, input) =>
      clientsService.moveDeal(ctx, moveDealSchema.parse(input)),
  },
  {
    name: "log_client_activity",
    title: "Log a client activity",
    description:
      "Log a note, call, email or meeting on at least one company, contact or deal.",
    inputSchema: {
      type: z
        .enum(["note", "call", "email", "meeting"])
        .default("note"),
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
      clientsService.createActivity(ctx, activityInputSchema.parse(input)),
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
      clientsService.listDocuments(
        ctx,
        input.entity as "client" | "contact" | "deal",
        String(input.entityId)
      ),
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
      clientsService.linkDocument(ctx, linkDocumentSchema.parse(input)),
  },
  {
    name: "unlink_client_document",
    title: "Unlink a document from a client record",
    description:
      "Remove the link between a file and a client record. The file itself stays in Files.",
    inputSchema: { documentId: z.string() },
    readOnly: false,
    run: (ctx, input) =>
      clientsService.unlinkDocument(ctx, String(input.documentId)),
  },
  {
    name: "link_client_project",
    title: "Link a project to a company",
    description:
      "Link an existing project to a company (client). If the project was linked to another company, it is re-linked to this one.",
    inputSchema: { clientId: z.string(), projectId: z.string() },
    readOnly: false,
    run: (ctx, input) =>
      clientsService.linkProject(ctx, linkProjectSchema.parse(input)),
  },
  {
    name: "unlink_client_project",
    title: "Unlink a project from a company",
    description:
      "Remove the link between a project and a company. The project itself is kept.",
    inputSchema: { clientId: z.string(), projectId: z.string() },
    readOnly: false,
    run: (ctx, input) =>
      clientsService.unlinkProject(ctx, unlinkProjectSchema.parse(input)),
  },
]
