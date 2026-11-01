import { z } from "zod"

import { REPOSITORY_PROVIDERS } from "./types"

const optionalBaseUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value === "" ? undefined : value))
  .refine(
    (value) => value === undefined || /^https?:\/\/\S+$/i.test(value),
    "Enter a valid URL (http:// or https://)."
  )

export const connectRepositorySchema = z.object({
  projectId: z.string().min(1),
  provider: z.enum(REPOSITORY_PROVIDERS),
  owner: z.string().trim().min(1).max(200),
  repo: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .transform((value) => value.replace(/\.git$/i, "")),
  /** Self-managed GitLab or GitHub Enterprise instance URL. */
  baseUrl: optionalBaseUrl,
})

export type ConnectRepositorySchemaInput = z.infer<
  typeof connectRepositorySchema
>

/** Personal access token saved from the user's profile. */
export const setUserRepositoryTokenSchema = z.object({
  provider: z.enum(REPOSITORY_PROVIDERS),
  token: z.string().trim().min(8).max(1000),
})

export type SetUserRepositoryTokenSchemaInput = z.infer<
  typeof setUserRepositoryTokenSchema
>
