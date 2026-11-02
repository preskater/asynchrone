"use server"

import { z } from "zod"

import { withAction } from "@workspace/core/action"
import { REPOSITORY_PROVIDERS } from "@workspace/projects/integrations/types"
import { setUserRepositoryTokenSchema } from "@workspace/projects/integrations/schemas"

import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"
import { callDomain, delegatedContext } from "@/lib/internal/domain"

const providerSchema = z.enum(REPOSITORY_PROVIDERS)

// --- personal repository tokens (Account settings) ---
// The encrypted tokens belong to the projects database; Copilot calls the
// projects internal API instead of reading another app's rows.

export const listUserRepositoryTokensAction = withAction(async () => {
  const ctx = await getRequestContext()
  return callDomain(
    "projects",
    "list-user-repository-tokens",
    delegatedContext(ctx),
    {},
    z.object({ github: z.boolean(), gitlab: z.boolean() })
  )
})

export const setUserRepositoryTokenAction = withAction(
  async (input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(setUserRepositoryTokenSchema, input)
    return callDomain(
      "projects",
      "set-user-repository-token",
      delegatedContext(ctx),
      parsed,
      z.object({
        provider: z.string(),
        configured: z.literal(true),
      })
    )
  }
)

export const removeUserRepositoryTokenAction = withAction(
  async (provider: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(providerSchema, provider)
    return callDomain(
      "projects",
      "remove-user-repository-token",
      delegatedContext(ctx),
      { provider: parsed },
      z.object({
        provider: z.string(),
        configured: z.literal(false),
      })
    )
  }
)
