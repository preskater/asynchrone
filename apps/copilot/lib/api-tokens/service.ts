import type { RequestContext } from "@workspace/core/context"
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@workspace/core/errors"
import { can } from "@workspace/core/roles"
import { parseRoles } from "@workspace/organization/roles"
import { requirePermission } from "@/lib/core/auth-context"
import { AUDIT_ACTIONS } from "@/lib/audit/actions"
import { recordUserAudit } from "@/lib/audit/record"
import { requireEntitlement } from "@/lib/organization/entitlements"
import { prisma } from "@/lib/prisma"

import type { CreateApiTokenInput } from "./schemas"
import {
  API_TOKEN_MAX_DAYS,
  apiTokenMatches,
  apiTokenPrefix,
  generateApiToken,
  type ApiTokenScope,
} from "./token"

const DAY_MS = 24 * 60 * 60 * 1000
const LAST_USED_RESOLUTION_MS = 60 * 1000

export interface ApiTokenSummary {
  id: string
  name: string
  prefix: string
  scopes: string[]
  expiresAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
  owner: { id: string; name: string; email: string }
}

const summarySelect = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const

// Fields are copied one by one so a wider select can never leak `tokenHash`.
function summary(
  row: Omit<ApiTokenSummary, "owner"> & { user: ApiTokenSummary["owner"] }
): ApiTokenSummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    owner: { id: row.user.id, name: row.user.name, email: row.user.email },
  }
}

/** Admins and owners see every token of the organization. */
function managesAllTokens(ctx: RequestContext) {
  return can(ctx, "member:manage")
}

/** The caller's tokens, or every token of the organization for admins. */
export async function listApiTokens(
  ctx: RequestContext
): Promise<ApiTokenSummary[]> {
  requirePermission(ctx, "workspace:read")
  const rows = await prisma.apiToken.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(managesAllTokens(ctx) ? {} : { userId: ctx.userId }),
    },
    select: summarySelect,
    orderBy: { createdAt: "desc" },
  })
  return rows.map(summary)
}

/** Creates a token and returns its plaintext, which is never shown again. */
export async function createApiToken(
  ctx: RequestContext,
  input: CreateApiTokenInput,
  now = new Date()
): Promise<{ token: string; apiToken: ApiTokenSummary }> {
  requirePermission(ctx, "workspace:read")
  await requireEntitlement(ctx.organizationId, "apiAccess")

  const lifetime = input.expiresAt.getTime() - now.getTime()
  if (lifetime < DAY_MS || lifetime > (API_TOKEN_MAX_DAYS + 1) * DAY_MS) {
    throw new ValidationError(
      `A token must expire between 1 and ${API_TOKEN_MAX_DAYS} days from now.`,
      undefined,
      { params: { max: API_TOKEN_MAX_DAYS } }
    )
  }

  const { token, prefix, tokenHash } = generateApiToken()
  const apiToken = await prisma.$transaction(async (tx) => {
    const row = await tx.apiToken.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        name: input.name,
        prefix,
        tokenHash,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
      },
      select: summarySelect,
    })
    await recordUserAudit(
      ctx,
      {
        action: AUDIT_ACTIONS.apiTokenCreated,
        entityType: "apiToken",
        entityId: row.id,
        entityLabel: `${row.name} (${row.prefix})`,
        after: { scopes: row.scopes, expiresAt: row.expiresAt.toISOString() },
      },
      tx
    )
    return row
  })
  return { token, apiToken: summary(apiToken) }
}

/** Revokes one of the caller's tokens, or any token for admins. Idempotent. */
export async function revokeApiToken(
  ctx: RequestContext,
  tokenId: string,
  now = new Date()
): Promise<void> {
  requirePermission(ctx, "workspace:read")
  await prisma.$transaction(async (tx) => {
    const row = await tx.apiToken.findFirst({
      where: {
        id: tokenId,
        organizationId: ctx.organizationId,
        ...(managesAllTokens(ctx) ? {} : { userId: ctx.userId }),
      },
      select: { id: true, name: true, prefix: true, revokedAt: true },
    })
    // Another member's token looks the same as an unknown one.
    if (!row) throw new NotFoundError("API token")
    if (row.revokedAt) return
    await tx.apiToken.update({
      where: { id: row.id },
      data: { revokedAt: now },
    })
    await recordUserAudit(
      ctx,
      {
        action: AUDIT_ACTIONS.apiTokenRevoked,
        entityType: "apiToken",
        entityId: row.id,
        entityLabel: `${row.name} (${row.prefix})`,
      },
      tx
    )
  })
}

export interface VerifiedApiToken {
  ctx: RequestContext
  tokenId: string
  prefix: string
  scopes: ApiTokenScope[]
  expiresAt: Date
}

/**
 * Resolves a bearer token to the owner's current workspace context. The
 * member's roles are read on every call, so a removed member or a lowered
 * role takes effect immediately.
 */
export async function verifyApiToken(
  token: string | null,
  now = new Date()
): Promise<VerifiedApiToken> {
  const prefix = token ? apiTokenPrefix(token) : null
  const row = prefix
    ? await prisma.apiToken.findUnique({
        where: { prefix },
        select: {
          id: true,
          organizationId: true,
          tokenHash: true,
          scopes: true,
          expiresAt: true,
          lastUsedAt: true,
          revokedAt: true,
          user: { select: { id: true, name: true, email: true, banned: true } },
        },
      })
    : null
  if (!token || !prefix || !row || !apiTokenMatches(token, row.tokenHash)) {
    throw new UnauthorizedError("The API token is invalid.", {
      code: "token_invalid",
    })
  }
  if (row.revokedAt) {
    throw new UnauthorizedError("The API token was revoked.", {
      code: "token_revoked",
    })
  }
  if (row.expiresAt <= now) {
    throw new UnauthorizedError("The API token has expired.", {
      code: "token_expired",
    })
  }

  const member = await prisma.member.findFirst({
    where: { organizationId: row.organizationId, userId: row.user.id },
    select: { role: true, clientId: true },
  })
  // The owner left the organization, became a portal account or was banned.
  if (!member || member.clientId || row.user.banned) {
    throw new UnauthorizedError("The API token is no longer valid.", {
      code: "token_revoked",
    })
  }

  if (
    !row.lastUsedAt ||
    now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_RESOLUTION_MS
  ) {
    await prisma.apiToken.update({
      where: { id: row.id },
      data: { lastUsedAt: now },
    })
  }

  return {
    tokenId: row.id,
    prefix,
    scopes: row.scopes as ApiTokenScope[],
    expiresAt: row.expiresAt,
    ctx: {
      userId: row.user.id,
      userName: row.user.name,
      userEmail: row.user.email,
      organizationId: row.organizationId,
      roles: parseRoles(member.role),
    },
  }
}

/** Throws unless the verified token carries `scope`. */
export function requireScope(token: VerifiedApiToken, scope: ApiTokenScope) {
  if (token.scopes.includes(scope)) return
  throw new ForbiddenError(`The API token lacks the "${scope}" scope.`, {
    code: "token_scope_missing",
    params: { scope },
  })
}
