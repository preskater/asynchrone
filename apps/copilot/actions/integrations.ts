"use server"

import { z } from "zod"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"
import {
  repositoryIntegrationService,
  setUserRepositoryTokenSchema,
} from "@/lib/integrations"
import { REPOSITORY_PROVIDERS } from "@workspace/projects/integrations/types"

const providerSchema = z.enum(REPOSITORY_PROVIDERS)

// --- personal repository tokens (Account settings) ---

export const listUserRepositoryTokensAction = withAction(async () => {
  const ctx = await getRequestContext()
  return repositoryIntegrationService.listUserTokens(ctx)
})

export const setUserRepositoryTokenAction = withAction(
  async (input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(setUserRepositoryTokenSchema, input)
    return repositoryIntegrationService.setUserToken(ctx, parsed)
  }
)

export const removeUserRepositoryTokenAction = withAction(
  async (provider: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(providerSchema, provider)
    return repositoryIntegrationService.removeUserToken(ctx, parsed)
  }
)
