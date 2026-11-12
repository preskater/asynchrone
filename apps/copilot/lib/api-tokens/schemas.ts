import { z } from "zod"

import { API_TOKEN_SCOPES } from "./scopes"

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z
    .array(z.enum(API_TOKEN_SCOPES))
    .min(1)
    .transform((scopes) => [...new Set(scopes)]),
  /** Checked against "now" by the service: at least one day, at most 365. */
  expiresAt: z.coerce.date(),
})
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>

export const apiTokenIdSchema = z.string().trim().min(1).max(64)
