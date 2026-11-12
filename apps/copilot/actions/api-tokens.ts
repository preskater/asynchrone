"use server"

import { headers } from "next/headers"

import { auth } from "@/lib/auth"
import { withAction } from "@workspace/core/action"
import { ForbiddenError } from "@workspace/core/errors"
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "@/lib/api-tokens/service"
import {
  apiTokenIdSchema,
  createApiTokenSchema,
} from "@/lib/api-tokens/schemas"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"

export const listApiTokensAction = withAction(async () =>
  listApiTokens(await getRequestContext())
)

export const createApiTokenAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  // A token would outlive the one-hour impersonation session (ADR 0042).
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.session.impersonatedBy) {
    throw new ForbiddenError(
      "API tokens cannot be created while impersonating."
    )
  }
  return createApiToken(ctx, await parseLocalized(createApiTokenSchema, input))
})

export const revokeApiTokenAction = withAction(async (tokenId: unknown) => {
  const ctx = await getRequestContext()
  await revokeApiToken(ctx, apiTokenIdSchema.parse(tokenId))
})
