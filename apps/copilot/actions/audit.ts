"use server"

import { z } from "zod"

import { auditFilterSchema, auditPageInputSchema } from "@/lib/audit/filters"
import { auditService } from "@/lib/audit/service"
import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"

const exportInputSchema = auditFilterSchema.extend({
  format: z.enum(["csv", "json"]).default("csv"),
})

const retentionInputSchema = z.union([
  z.number().int(),
  z.string().trim(),
  z.null(),
])

/** One page of the audit trail for the active filter. */
export const listAuditLogAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(auditPageInputSchema, input)
  return auditService.list(ctx, parsed)
})

/** Dropdown values for the filter bar. */
export const loadAuditFacetsAction = withAction(async () => {
  const ctx = await getRequestContext()
  return auditService.facets(ctx)
})

/** CSV or JSON export of the active filter, capped by `AUDIT_EXPORT_LIMIT`. */
export const exportAuditLogAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const { format, ...filter } = await parseLocalized(exportInputSchema, input)
  return auditService.export(ctx, filter, format)
})

export const getAuditRetentionAction = withAction(async () => {
  const ctx = await getRequestContext()
  return auditService.retention(ctx)
})

/** Sets (or clears, with `null`) the Enterprise retention override. */
export const setAuditRetentionAction = withAction(async (days: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(retentionInputSchema, days)
  return auditService.setRetention(ctx, parsed)
})
