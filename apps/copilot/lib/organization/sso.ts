import { headers } from "next/headers"
import { z } from "zod"

import {
  discoverIdentityProvider,
  ssoVerificationIdentifier,
} from "@workspace/auth/sso"
import { appOrigin } from "@workspace/contracts/server"
import type { RequestContext } from "@workspace/core/context"
import { BadRequestError, ValidationError } from "@workspace/core/errors"
import { can } from "@workspace/core/roles"

import { AUDIT_ACTIONS } from "@/lib/audit/actions"
import { recordUserAudit } from "@/lib/audit/record"
import { auth } from "@/lib/auth"
import { requirePermission } from "@/lib/core/auth-context"
import { requireEntitlement } from "@/lib/organization/entitlements"
import { prisma } from "@/lib/prisma"

/**
 * Organization SSO settings (#93, ADR 0044). Provider records, the OIDC/SAML
 * flows and DNS verification belong to the Better Auth `sso` plugin; this
 * module is the only caller of its management endpoints and adds the
 * entitlement, capability and audit rules around them.
 */

/** One provider per organization; its id is stable and appears in callbacks. */
export function providerIdFor(organizationId: string) {
  return `org-${organizationId}`
}

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)

const mappingSchema = {
  emailAttribute: z.string().trim().max(200).optional(),
  nameAttribute: z.string().trim().max(200).optional(),
}

export const ssoProviderInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("oidc"),
    domain: domainSchema,
    issuer: z.string().trim().url(),
    clientId: z.string().trim().min(1).max(500),
    /** Blank on update keeps the stored secret. */
    clientSecret: z.string().trim().max(2000).optional(),
    ...mappingSchema,
  }),
  z.object({
    kind: z.literal("saml"),
    domain: domainSchema,
    entryPoint: z.string().trim().url(),
    entityId: z.string().trim().min(1).max(500),
    certificate: z.string().trim().min(1).max(20_000),
    ...mappingSchema,
  }),
])
export type SsoProviderInput = z.infer<typeof ssoProviderInputSchema>

export interface SsoSettings {
  provider: {
    kind: "oidc" | "saml"
    domain: string
    domainVerified: boolean
    issuer: string
    clientId?: string
    entryPoint?: string
    entityId?: string
    emailAttribute?: string
    nameAttribute?: string
  } | null
  enforced: boolean
  /** The TXT record to publish while the domain is unverified. */
  verification: { name: string; value: string } | null
  urls: { oidcCallback: string; samlAcs: string; samlMetadata: string }
}

function parseJson(value: string | null): Record<string, any> | null {
  if (!value) return null
  try {
    return JSON.parse(value) as Record<string, any>
  } catch {
    return null
  }
}

function urlsFor(providerId: string) {
  const base = `${appOrigin("copilot")}/api/auth`
  return {
    oidcCallback: `${base}/sso/callback/${providerId}`,
    samlAcs: `${base}/sso/saml2/sp/acs/${providerId}`,
    samlMetadata: `${base}/sso/saml2/sp/metadata?providerId=${encodeURIComponent(providerId)}`,
  }
}

/** Plugin errors become coded, translated errors for the settings card. */
async function callPlugin<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    const body = (error as { body?: { code?: string; message?: string } }).body
    if (body?.code === "DOMAIN_VERIFICATION_FAILED") {
      throw new BadRequestError(body.message, {
        code: "sso_domain_verification_failed",
      })
    }
    const reason =
      body?.message ?? (error instanceof Error ? error.message : String(error))
    throw new ValidationError(reason, undefined, {
      code: "sso_provider_invalid",
      params: { reason },
    })
  }
}

/** Owners and admins see the settings; everyone else gets `null`. */
export async function getSsoSettings(
  ctx: RequestContext
): Promise<SsoSettings | null> {
  if (!can(ctx, "organization:update")) return null
  const providerId = providerIdFor(ctx.organizationId)
  const [provider, organization, verification] = await Promise.all([
    prisma.ssoProvider.findUnique({
      where: { organizationId: ctx.organizationId },
    }),
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { ssoEnforced: true },
    }),
    prisma.verification.findFirst({
      where: {
        identifier: ssoVerificationIdentifier(providerId),
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { value: true },
    }),
  ])

  const oidc = parseJson(provider?.oidcConfig ?? null)
  const saml = parseJson(provider?.samlConfig ?? null)
  const mapping = (oidc?.mapping ?? saml?.mapping ?? {}) as Record<
    string,
    string | undefined
  >
  const verified = provider?.domainVerified === true
  return {
    provider: provider
      ? {
          kind: saml ? "saml" : "oidc",
          domain: provider.domain,
          domainVerified: verified,
          issuer: provider.issuer,
          clientId: oidc?.clientId,
          entryPoint: saml?.entryPoint,
          entityId: saml?.idpMetadata?.entityID,
          emailAttribute: mapping.email,
          nameAttribute: mapping.name,
        }
      : null,
    enforced: organization?.ssoEnforced ?? false,
    verification:
      provider && !verified && verification
        ? {
            name: `${ssoVerificationIdentifier(providerId)}.${provider.domain}`,
            value: verification.value,
          }
        : null,
    urls: urlsFor(providerId),
  }
}

function mappingFor(input: SsoProviderInput) {
  return {
    id: "sub",
    email: input.emailAttribute || "email",
    name: input.nameAttribute || "name",
  }
}

/** Create or replace the organization's identity provider. */
export async function saveSsoProvider(
  ctx: RequestContext,
  input: SsoProviderInput
) {
  requirePermission(ctx, "organization:update")
  await requireEntitlement(ctx.organizationId, "sso")

  const providerId = providerIdFor(ctx.organizationId)
  const [existing, organization] = await Promise.all([
    prisma.ssoProvider.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { domain: true, oidcConfig: true, samlConfig: true },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { name: true },
    }),
  ])
  const requestHeaders = await headers()

  let issuer: string
  let oidcConfig: Record<string, unknown> | undefined
  let samlConfig: Record<string, unknown> | undefined
  if (input.kind === "oidc") {
    const discovered = await callPlugin(() =>
      discoverIdentityProvider(input.issuer)
    )
    const previousSecret = parseJson(existing?.oidcConfig ?? null)?.clientSecret
    const clientSecret = input.clientSecret || previousSecret
    if (!clientSecret) {
      throw new ValidationError("A client secret is required.", undefined, {
        code: "sso_provider_invalid",
        params: { reason: "client secret" },
      })
    }
    issuer = discovered.issuer
    oidcConfig = {
      clientId: input.clientId,
      clientSecret,
      authorizationEndpoint: discovered.authorizationEndpoint,
      tokenEndpoint: discovered.tokenEndpoint,
      jwksEndpoint: discovered.jwksEndpoint,
      userInfoEndpoint: discovered.userInfoEndpoint,
      discoveryEndpoint: discovered.discoveryEndpoint,
      tokenEndpointAuthentication: discovered.tokenEndpointAuthentication,
      skipDiscovery: true,
      mapping: mappingFor(input),
    }
  } else {
    // For SAML the issuer names our service provider; the IdP is the entity ID.
    issuer = appOrigin("copilot")
    samlConfig = {
      entryPoint: input.entryPoint,
      cert: input.certificate,
      idpMetadata: { entityID: input.entityId },
      mapping: mappingFor(input),
    }
  }

  // Switching protocol is a new provider; the plugin keeps one config per row.
  const switching =
    existing &&
    (input.kind === "oidc" ? !existing.oidcConfig : !existing.samlConfig)
  if (existing && switching) {
    await callPlugin(() =>
      auth.api.deleteSSOProvider({
        headers: requestHeaders,
        body: { providerId },
      })
    )
  }
  if (existing && !switching) {
    await callPlugin(() =>
      auth.api.updateSSOProvider({
        headers: requestHeaders,
        body: {
          providerId,
          issuer,
          domain: input.domain,
          ...(oidcConfig ? { oidcConfig } : {}),
          ...(samlConfig ? { samlConfig } : {}),
        } as never,
      })
    )
  } else {
    await callPlugin(() =>
      auth.api.registerSSOProvider({
        headers: requestHeaders,
        body: {
          providerId,
          organizationId: ctx.organizationId,
          issuer,
          domain: input.domain,
          ...(oidcConfig ? { oidcConfig } : {}),
          ...(samlConfig ? { samlConfig } : {}),
        } as never,
      })
    )
  }

  // A new domain must be verified again before SSO-only can stay on.
  if (existing && existing.domain !== input.domain) {
    await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: { ssoEnforced: false },
    })
  }

  await recordUserAudit(ctx, {
    action: AUDIT_ACTIONS.organizationSsoProviderUpdated,
    entityType: "organization",
    entityId: ctx.organizationId,
    entityLabel: organization.name,
    before: existing ? { domain: existing.domain } : null,
    after: { kind: input.kind, domain: input.domain, issuer },
  })
}

export async function removeSsoProvider(ctx: RequestContext) {
  requirePermission(ctx, "organization:update")
  const existing = await prisma.ssoProvider.findUnique({
    where: { organizationId: ctx.organizationId },
    select: { domain: true, organization: { select: { name: true } } },
  })
  if (!existing) return

  await callPlugin(async () =>
    auth.api.deleteSSOProvider({
      headers: await headers(),
      body: { providerId: providerIdFor(ctx.organizationId) },
    })
  )
  await prisma.organization.update({
    where: { id: ctx.organizationId },
    data: { ssoEnforced: false },
  })
  await recordUserAudit(ctx, {
    action: AUDIT_ACTIONS.organizationSsoProviderRemoved,
    entityType: "organization",
    entityId: ctx.organizationId,
    entityLabel: existing.organization?.name ?? null,
    before: { domain: existing.domain },
  })
}

/** Issue a fresh TXT token (the previous one may have expired). */
export async function requestSsoDomainVerification(ctx: RequestContext) {
  requirePermission(ctx, "organization:update")
  await requireEntitlement(ctx.organizationId, "sso")
  await callPlugin(async () =>
    auth.api.requestDomainVerification({
      headers: await headers(),
      body: { providerId: providerIdFor(ctx.organizationId) },
    })
  )
}

export async function verifySsoDomain(ctx: RequestContext) {
  requirePermission(ctx, "organization:update")
  await requireEntitlement(ctx.organizationId, "sso")
  await callPlugin(async () =>
    auth.api.verifyDomain({
      headers: await headers(),
      body: { providerId: providerIdFor(ctx.organizationId) },
    })
  )
  const provider = await prisma.ssoProvider.findUnique({
    where: { organizationId: ctx.organizationId },
    select: { domain: true, organization: { select: { name: true } } },
  })
  await recordUserAudit(ctx, {
    action: AUDIT_ACTIONS.organizationSsoDomainVerified,
    entityType: "organization",
    entityId: ctx.organizationId,
    entityLabel: provider?.organization?.name ?? null,
    after: { domain: provider?.domain ?? null },
  })
}

export async function setSsoEnforced(ctx: RequestContext, enforced: boolean) {
  requirePermission(ctx, "organization:update")
  // Turning it off is always allowed, so a downgraded org can clear it.
  if (enforced) {
    await requireEntitlement(ctx.organizationId, "sso")
    const provider = await prisma.ssoProvider.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { domainVerified: true },
    })
    if (!provider?.domainVerified) {
      throw new BadRequestError("Verify the domain first.", {
        code: "sso_domain_unverified",
      })
    }
  }

  await prisma.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { name: true, ssoEnforced: true },
    })
    if (before.ssoEnforced === enforced) return
    await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { ssoEnforced: enforced },
    })
    await recordUserAudit(
      ctx,
      {
        action: AUDIT_ACTIONS.organizationSsoEnforcementUpdated,
        entityType: "organization",
        entityId: ctx.organizationId,
        entityLabel: before.name,
        before: { ssoEnforced: before.ssoEnforced },
        after: { ssoEnforced: enforced },
      },
      tx
    )
  })
}
