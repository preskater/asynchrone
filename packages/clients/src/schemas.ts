import { z } from "zod"

import {
  CLIENT_ACTIVITY_TYPES,
  CLIENT_STATUSES,
  CLIENT_CURRENCIES,
  CLIENT_DOCUMENT_VISIBILITIES,
  CLIENT_FIELD_ENTITIES,
  CLIENT_FIELD_TYPES,
  DEAL_STATUSES,
  PIPELINE_STAGE_TYPES,
} from "./types"

// Rejects impossible days (2026-02-30) a bare pattern lets through.
export const dateKeySchema = z.iso.date("Expected a YYYY-MM-DD date.")

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional()

const customFieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
])

export const customFieldsSchema = z
  .record(z.string().min(1), customFieldValueSchema)
  .optional()

export const clientInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  status: z.enum(CLIENT_STATUSES).default("prospect"),
  industry: optionalText(120),
  website: optionalText(300),
  phone: optionalText(50),
  address: optionalText(300),
  description: optionalText(2000),
  source: optionalText(120),
  ownerId: z.string().min(1).nullable().optional(),
  contactEmail: optionalText(200),
  isActive: z.boolean().default(true),
  customFields: customFieldsSchema,
})

export const contactCompanyInputSchema = z.object({
  clientId: z.string().min(1),
  jobTitle: optionalText(120),
  isPrimary: z.boolean().default(false),
})

export const contactInputSchema = z.object({
  id: z.string().min(1).optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(""),
  email: optionalText(200),
  phone: optionalText(50),
  jobTitle: optionalText(120),
  notes: optionalText(2000),
  ownerId: z.string().min(1).nullable().optional(),
  customFields: customFieldsSchema,
  companies: z.array(contactCompanyInputSchema).max(20).default([]),
})

export const dealInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(160),
  clientId: z.string().min(1).nullable().optional(),
  pipelineId: z.string().min(1).nullable().optional(),
  stageId: z.string().min(1).nullable().optional(),
  amount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  currency: z.enum(CLIENT_CURRENCIES).default("EUR"),
  probability: z.coerce.number().int().min(0).max(100).default(50),
  expectedCloseDate: dateKeySchema.nullable().optional(),
  source: optionalText(120),
  description: optionalText(2000),
  ownerId: z.string().min(1).nullable().optional(),
  customFields: customFieldsSchema,
  contactIds: z.array(z.string().min(1)).max(20).default([]),
})

export const moveDealSchema = z.object({
  dealId: z.string().min(1),
  stageId: z.string().min(1),
  position: z.number().int().min(0).optional(),
  /** Asked by the board when dropping on a lost-type stage. */
  lossReason: optionalText(300),
})

export const closeDealSchema = z.object({
  dealId: z.string().min(1),
  status: z.enum(DEAL_STATUSES).refine((value) => value !== "open", {
    message: "Choose won or lost.",
  }),
  lossReason: optionalText(300),
  actualCloseDate: dateKeySchema.nullable().optional(),
})

export const reopenDealSchema = z.object({
  dealId: z.string().min(1),
})

export const recordIdSchema = z.object({
  id: z.string().min(1),
})

export const pipelineInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  /** Applies when creating; existing pipelines keep their default flag. */
  makeDefault: z.boolean().default(false),
})

export const stageInputSchema = z.object({
  pipelineId: z.string().min(1),
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  type: z.enum(PIPELINE_STAGE_TYPES).default("open"),
  color: optionalText(20),
})

export const moveStageSchema = z.object({
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  direction: z.enum(["up", "down"]),
})

export const setDefaultPipelineSchema = z.object({
  pipelineId: z.string().min(1),
})

export const fieldDefinitionSchema = z
  .object({
    id: z.string().min(1).optional(),
    entity: z.enum(CLIENT_FIELD_ENTITIES),
    label: z.string().trim().min(1).max(80),
    type: z.enum(CLIENT_FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    isRequired: z.boolean().default(false),
  })
  .refine(
    (value) =>
      (value.type !== "select" && value.type !== "multiselect") ||
      value.options.length > 0,
    { message: "Select fields need at least one option.", path: ["options"] }
  )

export const deleteFieldDefinitionSchema = z.object({
  id: z.string().min(1),
})

export const activityInputSchema = z
  .object({
    type: z.enum(CLIENT_ACTIVITY_TYPES).default("note"),
    subject: optionalText(160),
    body: z.string().trim().min(1).max(4000),
    /** ISO timestamp or `datetime-local` value; defaults to now. */
    occurredAt: z.string().min(1).nullable().optional(),
    clientId: z.string().min(1).nullable().optional(),
    contactId: z.string().min(1).nullable().optional(),
    dealId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => value.clientId || value.contactId || value.dealId, {
    message: "Link the entry to at least one record.",
    path: ["clientId"],
  })

export const exportSchema = z.object({
  entity: z.enum(["clients", "contacts", "deals"]),
})

export const linkDocumentSchema = z.object({
  entity: z.enum(CLIENT_FIELD_ENTITIES),
  entityId: z.string().min(1),
  fileId: z.string().min(1),
  visibility: z.enum(CLIENT_DOCUMENT_VISIBILITIES).default("internal"),
})

export const unlinkDocumentSchema = z.object({
  id: z.string().min(1),
})

export const updateDocumentVisibilitySchema = z.object({
  id: z.string().min(1),
  visibility: z.enum(CLIENT_DOCUMENT_VISIBILITIES),
})

export const linkProjectSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().min(1),
})

export const unlinkProjectSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().min(1),
})

const importClientRowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  status: z.enum(CLIENT_STATUSES).optional(),
  industry: optionalText(120),
  website: optionalText(300),
  phone: optionalText(50),
  address: optionalText(300),
  contactEmail: optionalText(200),
  description: optionalText(2000),
  source: optionalText(120),
})

export const importClientsSchema = z.object({
  rows: z.array(importClientRowSchema).min(1).max(500),
})

const importContactRowSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional(),
  email: optionalText(200),
  phone: optionalText(50),
  jobTitle: optionalText(120),
  /** Name of an existing company to link; unknown names are ignored. */
  company: optionalText(120),
})

export const importContactsSchema = z.object({
  rows: z.array(importContactRowSchema).min(1).max(500),
})

export type ClientInput = z.infer<typeof clientInputSchema>
export type ContactInput = z.infer<typeof contactInputSchema>
export type DealInput = z.infer<typeof dealInputSchema>
export type MoveDealInput = z.infer<typeof moveDealSchema>
export type CloseDealInput = z.infer<typeof closeDealSchema>
export type PipelineInput = z.infer<typeof pipelineInputSchema>
export type StageInput = z.infer<typeof stageInputSchema>
export type MoveStageInput = z.infer<typeof moveStageSchema>
export type FieldDefinitionInput = z.infer<typeof fieldDefinitionSchema>
export type ActivityInput = z.infer<typeof activityInputSchema>
export type ExportInput = z.infer<typeof exportSchema>
export type ImportClientsInput = z.infer<typeof importClientsSchema>
export type ImportContactsInput = z.infer<typeof importContactsSchema>
export type LinkDocumentInput = z.infer<typeof linkDocumentSchema>
export type UnlinkDocumentInput = z.infer<typeof unlinkDocumentSchema>
export type UpdateDocumentVisibilityInput = z.infer<
  typeof updateDocumentVisibilitySchema
>
export type LinkProjectInput = z.infer<typeof linkProjectSchema>
export type UnlinkProjectInput = z.infer<typeof unlinkProjectSchema>
