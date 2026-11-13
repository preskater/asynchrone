"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"
import {
  removeSsoProvider,
  requestSsoDomainVerification,
  saveSsoProvider,
  setSsoEnforced,
  ssoProviderInputSchema,
  verifySsoDomain,
} from "@/lib/organization/sso"

export const saveSsoProviderAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  await saveSsoProvider(
    ctx,
    await parseLocalized(ssoProviderInputSchema, input)
  )
})

export const removeSsoProviderAction = withAction(async () => {
  const ctx = await getRequestContext()
  await removeSsoProvider(ctx)
})

export const requestSsoDomainVerificationAction = withAction(async () => {
  const ctx = await getRequestContext()
  await requestSsoDomainVerification(ctx)
})

export const verifySsoDomainAction = withAction(async () => {
  const ctx = await getRequestContext()
  await verifySsoDomain(ctx)
})

export const setSsoEnforcedAction = withAction(async (enforced: boolean) => {
  const ctx = await getRequestContext()
  await setSsoEnforced(ctx, enforced === true)
})
