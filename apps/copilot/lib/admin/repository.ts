import { createHash, randomBytes } from "node:crypto"

import {
  type AdminAiUsage,
  type AdminAuditPage,
  type AdminBanInput,
  type AdminHandoffInput,
  type AdminHandoffResult,
  type AdminOAuthClient,
  type AdminOAuthClientDisabledInput,
  type AdminOps,
  type AdminOrganization,
  type AdminOrganizationDetail,
  type AdminOrganizationPage,
  type AdminOverview,
  type AdminPlanInput,
  type AdminSessionRevokeResult,
  type AdminSupportTicket,
  type AdminSupportTicketPage,
  type AdminSupportTicketUpdate,
  type AdminTrialInput,
  type SupportTicketStatus,
  type AdminUser,
  type AdminUserDetail,
  type AdminUserPage,
} from "@workspace/contracts"
import { planForOrganization } from "@workspace/audit"
import { monthWindow } from "@workspace/core/plans"
import { prisma } from "@workspace/db-identity"

const DAY = 24 * 60 * 60 * 1000
const PAGE_SIZE = 50
const AUDIT_LIMIT = 100
const OPS_WINDOW_DAYS = 30

export interface AdminRepository {
  listOrganizations(input: {
    query?: string
    cursor?: string | null
    offset?: number
    limit?: number
  }): Promise<AdminOrganizationPage>
  getOrganization(id: string): Promise<AdminOrganization | null>
  getOrganizationDetail(id: string): Promise<AdminOrganizationDetail | null>
  updatePlan(
    id: string,
    input: AdminPlanInput
  ): Promise<AdminOrganization | null>
  releasePlan(id: string): Promise<AdminOrganization | null>
  setTrial(
    id: string,
    input: AdminTrialInput
  ): Promise<AdminOrganization | null>
  listUsers(input: {
    query?: string
    cursor?: string | null
    offset?: number
    limit?: number
  }): Promise<AdminUserPage>
  getUser(id: string): Promise<AdminUser | null>
  getUserDetail(id: string): Promise<AdminUserDetail | null>
  setBan(id: string, input: AdminBanInput): Promise<AdminUser | null>
  revokeSessions(id: string): Promise<AdminSessionRevokeResult>
  createHandoff(input: AdminHandoffInput): Promise<AdminHandoffResult>
  overview(): Promise<AdminOverview>
  ops(): Promise<AdminOps>
  listAudit(input: { limit?: number }): Promise<AdminAuditPage>
  getOAuthClient(clientId: string): Promise<AdminOAuthClient | null>
  setOAuthClientDisabled(
    clientId: string,
    input: AdminOAuthClientDisabledInput
  ): Promise<AdminOAuthClient | null>
  listSupportTickets(input: {
    status?: SupportTicketStatus
    limit?: number
  }): Promise<AdminSupportTicketPage>
  getSupportTicket(id: string): Promise<AdminSupportTicket | null>
  updateSupportTicket(
    id: string,
    input: AdminSupportTicketUpdate
  ): Promise<AdminSupportTicket | null>
}

type OrgRow = {
  id: string
  name: string
  slug: string
  metadata: string | null
  createdAt: Date
  trialEndsAt: Date | null
  deletionScheduledAt: Date | null
  storageQuotaBytes: bigint | null
  subscription: {
    plan: string
    status: string
    manualOverride: boolean
  } | null
  _count: { members: number }
}

function organization(row: OrgRow): AdminOrganization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: planForOrganization({
      metadata: row.metadata,
      subscription: row.subscription,
    }),
    subscriptionStatus: row.subscription?.status ?? null,
    manualOverride: row.subscription?.manualOverride ?? false,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    deletionScheduledAt: row.deletionScheduledAt?.toISOString() ?? null,
    memberCount: row._count.members,
    storageQuotaBytes: row.storageQuotaBytes?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

type UserRow = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: string | null
  banned: boolean | null
  banReason: string | null
  twoFactorEnabled: boolean | null
  lastSeenAt: Date | null
  createdAt: Date
  _count: { members: number }
  sessions: { updatedAt: Date }[]
}

function user(row: UserRow): AdminUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    role: row.role,
    banned: row.banned ?? false,
    banReason: row.banReason,
    twoFactorEnabled: row.twoFactorEnabled ?? false,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    organizationCount: row._count.members,
    lastSessionAt: row.sessions[0]?.updatedAt.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

type OAuthClientRow = {
  clientId: string
  name: string | null
  disabled: boolean | null
  userId: string | null
  referenceId: string | null
  createdAt: Date | null
}

function oauthClient(row: OAuthClientRow): AdminOAuthClient {
  return {
    clientId: row.clientId,
    name: row.name,
    disabled: row.disabled ?? false,
    userId: row.userId,
    referenceId: row.referenceId,
    createdAt: row.createdAt?.toISOString() ?? null,
  }
}

function aiUsage(row: {
  _sum: {
    costMicros: number | null
    inputTokens: number | null
    outputTokens: number | null
  }
  _count: number
}): AdminAiUsage {
  return {
    costMicros: row._sum.costMicros ?? 0,
    inputTokens: row._sum.inputTokens ?? 0,
    outputTokens: row._sum.outputTokens ?? 0,
    runs: row._count,
  }
}

const ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  metadata: true,
  createdAt: true,
  trialEndsAt: true,
  deletionScheduledAt: true,
  storageQuotaBytes: true,
  subscription: { select: { plan: true, status: true, manualOverride: true } },
  _count: { select: { members: true } },
} as const

const SUPPORT_TICKET_LIMIT = 100

const SUPPORT_TICKET_SELECT = {
  id: true,
  number: true,
  status: true,
  organizationId: true,
  userId: true,
  category: true,
  impact: true,
  title: true,
  description: true,
  contactEmail: true,
  allowContact: true,
  details: true,
  context: true,
  assigneeEmail: true,
  acknowledgedAt: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  organization: {
    select: {
      name: true,
      slug: true,
      metadata: true,
      subscription: { select: { plan: true } },
    },
  },
  user: { select: { name: true } },
} as const

type SupportTicketRow = Awaited<
  ReturnType<
    typeof prisma.supportTicket.findFirstOrThrow<{
      select: typeof SUPPORT_TICKET_SELECT
    }>
  >
>

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function supportTicket(row: SupportTicketRow): AdminSupportTicket {
  return {
    id: row.id,
    number: row.number,
    status: row.status as SupportTicketStatus,
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    organizationSlug: row.organization.slug,
    plan: planForOrganization(row.organization),
    userId: row.userId,
    userName: row.user.name,
    category: row.category,
    impact: row.impact,
    title: row.title,
    description: row.description,
    contactEmail: row.contactEmail,
    allowContact: row.allowContact,
    details: jsonObject(row.details),
    context: jsonObject(row.context),
    assigneeEmail: row.assigneeEmail,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  role: true,
  banned: true,
  banReason: true,
  twoFactorEnabled: true,
  lastSeenAt: true,
  createdAt: true,
  _count: { select: { members: true } },
  sessions: {
    orderBy: { updatedAt: "desc" as const },
    take: 1,
    select: { updatedAt: true },
  },
} as const

const OAUTH_CLIENT_SELECT = {
  clientId: true,
  name: true,
  disabled: true,
  userId: true,
  referenceId: true,
  createdAt: true,
} as const

function limitOf(value: number | undefined): number {
  return value && value > 0 ? Math.min(Math.floor(value), 100) : PAGE_SIZE
}

function metadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export const adminRepository: AdminRepository = {
  async listOrganizations({ query, cursor, offset, limit }) {
    const take = limitOf(limit)
    const where = query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { slug: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}
    const rows = await prisma.organization.findMany({
      where,
      select: ORG_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : offset && offset > 0
          ? { skip: Math.floor(offset) }
          : {}),
    })
    const hasMore = rows.length > take
    const items = hasMore ? rows.slice(0, take) : rows
    return {
      items: items.map(organization),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      total: await prisma.organization.count({ where }),
    }
  },

  async getOrganization(id) {
    const row = await prisma.organization.findUnique({
      where: { id },
      select: ORG_SELECT,
    })
    return row ? organization(row) : null
  },

  async getOrganizationDetail(id) {
    const month = monthWindow()
    const previousMonth = monthWindow(new Date(month.start.getTime() - DAY))
    const row = await prisma.organization.findUnique({
      where: { id },
      select: {
        ...ORG_SELECT,
        trialStartedAt: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            provider: true,
            billingInterval: true,
            currentPeriodEnd: true,
            trialEndsAt: true,
            cancelAtPeriodEnd: true,
            manualOverride: true,
            providerCustomerId: true,
            providerSubscriptionId: true,
            updatedAt: true,
          },
        },
      },
    })
    if (!row) return null

    const [members, oauthClients, recentAudit, currentAi, previousAi, seats] =
      await Promise.all([
        prisma.member.findMany({
          where: { organizationId: id },
          orderBy: { createdAt: "asc" },
          take: 100,
          select: {
            id: true,
            role: true,
            clientId: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                emailVerified: true,
                banned: true,
              },
            },
          },
        }),
        prisma.oauthClient.findMany({
          where: { referenceId: id },
          orderBy: { createdAt: "desc" },
          select: OAUTH_CLIENT_SELECT,
        }),
        prisma.auditLog.findMany({
          where: { organizationId: id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            actorId: true,
            createdAt: true,
          },
        }),
        prisma.aiUsageEvent.aggregate({
          where: { organizationId: id, createdAt: { gte: month.start } },
          _sum: { costMicros: true, inputTokens: true, outputTokens: true },
          _count: true,
        }),
        prisma.aiUsageEvent.aggregate({
          where: {
            organizationId: id,
            createdAt: { gte: previousMonth.start, lt: month.start },
          },
          _sum: { costMicros: true },
        }),
        prisma.member.count({
          where: { organizationId: id, clientId: null },
        }),
      ])

    return {
      ...organization(row),
      trialStartedAt: row.trialStartedAt?.toISOString() ?? null,
      seatCount: seats,
      subscription: row.subscription
        ? {
            plan: row.subscription.plan,
            status: row.subscription.status,
            provider: row.subscription.provider,
            billingInterval: row.subscription.billingInterval,
            currentPeriodEnd:
              row.subscription.currentPeriodEnd?.toISOString() ?? null,
            trialEndsAt: row.subscription.trialEndsAt?.toISOString() ?? null,
            cancelAtPeriodEnd: row.subscription.cancelAtPeriodEnd,
            manualOverride: row.subscription.manualOverride,
            providerCustomerId: row.subscription.providerCustomerId,
            providerSubscriptionId: row.subscription.providerSubscriptionId,
            updatedAt: row.subscription.updatedAt.toISOString(),
          }
        : null,
      members: members.map((member) => ({
        id: member.id,
        role: member.role,
        clientId: member.clientId,
        createdAt: member.createdAt.toISOString(),
        user: {
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          emailVerified: member.user.emailVerified,
          banned: member.user.banned ?? false,
        },
      })),
      oauthClients: oauthClients.map(oauthClient),
      recentAudit: recentAudit.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorId: entry.actorId,
        createdAt: entry.createdAt.toISOString(),
      })),
      aiUsage: aiUsage(currentAi),
      previousMonthAiCostMicros: previousAi._sum.costMicros ?? 0,
    }
  },

  async updatePlan(id, input) {
    const row = await prisma.organization.findUnique({
      where: { id },
      select: {
        metadata: true,
        storageQuotaBytes: true,
        subscription: { select: { plan: true } },
      },
    })
    if (!row) return null
    const next = metadata(row.metadata)
    next.plan = input.plan
    const status = input.plan === "free" ? "inactive" : "active"
    await prisma.$transaction([
      prisma.organization.update({
        where: { id },
        data: {
          metadata: JSON.stringify(next),
          storageQuotaBytes:
            input.quotaBytes === null ? null : BigInt(input.quotaBytes),
        },
      }),
      prisma.subscription.upsert({
        where: { organizationId: id },
        create: {
          organizationId: id,
          plan: input.plan,
          status,
          provider: "manual",
          manualOverride: true,
        },
        update: {
          plan: input.plan,
          status,
          provider: "manual",
          manualOverride: true,
          cancelAtPeriodEnd: false,
        },
      }),
    ])
    return this.getOrganization(id)
  },

  async releasePlan(id) {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: id },
      select: { providerSubscriptionId: true, manualOverride: true },
    })
    if (!subscription?.manualOverride) return this.getOrganization(id)
    await prisma.subscription.update({
      where: { organizationId: id },
      data: {
        manualOverride: false,
        provider: subscription.providerSubscriptionId ? "stripe" : "manual",
      },
    })
    return this.getOrganization(id)
  },

  async setTrial(id, input) {
    const now = new Date()
    await prisma.organization.update({
      where: { id },
      data: input.end
        ? { trialEndsAt: now, trialEndedAt: now }
        : {
            trialStartedAt: now,
            trialEndsAt: new Date(now.getTime() + input.days * DAY),
            trialEndedAt: null,
            trialReminderSentAt: null,
          },
    })
    return this.getOrganization(id)
  },

  async listUsers({ query, cursor, offset, limit }) {
    const take = limitOf(limit)
    const where = query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}
    const rows = await prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : offset && offset > 0
          ? { skip: Math.floor(offset) }
          : {}),
    })
    const hasMore = rows.length > take
    const items = hasMore ? rows.slice(0, take) : rows
    return {
      items: items.map(user),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      total: await prisma.user.count({ where }),
    }
  },

  async getUser(id) {
    const row = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    })
    return row ? user(row) : null
  },

  async getUserDetail(id) {
    const now = new Date()
    const row = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    })
    if (!row) return null

    const [memberships, sessions, accounts, oauthClients] = await Promise.all([
      prisma.member.findMany({
        where: { userId: id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          clientId: true,
          createdAt: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.session.findMany({
        where: { userId: id, expiresAt: { gt: now } },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          ipAddress: true,
          userAgent: true,
          impersonatedBy: true,
        },
      }),
      prisma.account.findMany({
        where: { userId: id },
        orderBy: { createdAt: "asc" },
        select: { providerId: true, createdAt: true },
      }),
      prisma.oauthClient.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        select: OAUTH_CLIENT_SELECT,
      }),
    ])

    return {
      ...user(row),
      memberships: memberships.map((membership) => ({
        id: membership.id,
        role: membership.role,
        clientId: membership.clientId,
        createdAt: membership.createdAt.toISOString(),
        organization: {
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
        },
      })),
      sessions: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        impersonatedBy: session.impersonatedBy,
      })),
      accounts: accounts.map((account) => ({
        providerId: account.providerId,
        createdAt: account.createdAt.toISOString(),
      })),
      oauthClients: oauthClients.map(oauthClient),
    }
  },

  async setBan(id, input) {
    const row = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    })
    if (!row) return null
    const banReason = input.banned
      ? input.reason?.trim() || "Banned from the control tower"
      : null
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          banned: input.banned,
          banReason,
          banExpires: null,
        },
      })
      if (input.banned) {
        await tx.session.deleteMany({ where: { userId: id } })
      }
    })
    return this.getUser(id)
  },

  async revokeSessions(id) {
    const result = await prisma.session.deleteMany({ where: { userId: id } })
    return { deleted: result.count }
  },

  async createHandoff(input) {
    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, banned: true },
    })
    if (!target) throw new Error("User not found")
    if (target.banned) throw new Error("Banned accounts cannot be impersonated")

    const organization =
      (input.organizationId
        ? await prisma.member.findFirst({
            where: { userId: target.id, organizationId: input.organizationId },
            select: { organizationId: true },
          })
        : null) ??
      (await prisma.member.findFirst({
        where: { userId: target.id, clientId: null },
        orderBy: { createdAt: "asc" },
        select: { organizationId: true },
      }))

    const token = randomBytes(32).toString("hex")
    await prisma.platformHandoff.create({
      data: {
        tokenHash: createHash("sha256").update(token).digest("hex"),
        kind: "impersonate",
        actorId: input.actorId ?? "control-tower",
        targetUserId: target.id,
        organizationId: organization?.organizationId ?? null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    const base = (process.env.PLATFORM_APP_URL ?? "").replace(/\/$/, "")
    if (!base) throw new Error("PLATFORM_APP_URL is required")
    return { url: `${base}/api/platform/handoff?token=${token}` }
  },

  async overview() {
    const now = new Date()
    const [organizations, users, activeSessions, newestOrganizations] =
      await Promise.all([
        prisma.organization.count(),
        prisma.user.count(),
        prisma.session.count({ where: { expiresAt: { gt: now } } }),
        prisma.organization.findMany({
          orderBy: { createdAt: "desc" },
          take: 8,
          select: ORG_SELECT,
        }),
      ])
    return {
      organizations,
      users,
      activeSessions,
      newestOrganizations: newestOrganizations.map(organization),
    }
  },

  async ops() {
    const now = new Date()
    const since = new Date(now.getTime() - OPS_WINDOW_DAYS * DAY)
    const [active, expired, pending, signingKeys, clients, disabled, ai] =
      await Promise.all([
        prisma.session.count({ where: { expiresAt: { gt: now } } }),
        prisma.session.count({ where: { expiresAt: { lte: now } } }),
        prisma.invitation.count({ where: { status: "pending" } }),
        prisma.jwks.findMany({
          orderBy: { createdAt: "desc" },
          select: { id: true, alg: true, createdAt: true, expiresAt: true },
        }),
        prisma.oauthClient.count(),
        prisma.oauthClient.count({ where: { disabled: true } }),
        prisma.aiUsageEvent.aggregate({
          where: { createdAt: { gte: since } },
          _sum: { costMicros: true, inputTokens: true, outputTokens: true },
          _count: true,
        }),
      ])
    return {
      sessions: { active, expired },
      invitations: { pending },
      signingKeys: signingKeys.map((key) => ({
        id: key.id,
        alg: key.alg,
        createdAt: key.createdAt.toISOString(),
        expiresAt: key.expiresAt?.toISOString() ?? null,
      })),
      oauthClients: { total: clients, disabled },
      aiUsage: { ...aiUsage(ai), windowDays: OPS_WINDOW_DAYS },
    }
  },

  async listAudit({ limit }) {
    const take =
      limit && limit > 0
        ? Math.min(Math.floor(limit), AUDIT_LIMIT)
        : AUDIT_LIMIT
    const entries = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        organizationId: true,
        action: true,
        entityType: true,
        entityId: true,
        entityLabel: true,
        actorId: true,
        actorName: true,
        actorEmail: true,
        createdAt: true,
      },
    })
    const organizationIds = [...new Set(entries.map((e) => e.organizationId))]
    const organizations = await prisma.organization.findMany({
      where: { id: { in: organizationIds } },
      select: { id: true, name: true },
    })
    const nameById = new Map(
      organizations.map((organization) => [organization.id, organization.name])
    )
    return {
      items: entries.map((entry) => ({
        id: entry.id,
        organizationId: entry.organizationId,
        organizationName:
          nameById.get(entry.organizationId) ?? entry.organizationId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityLabel: entry.entityLabel,
        actorId: entry.actorId,
        actorName: entry.actorName,
        actorEmail: entry.actorEmail,
        createdAt: entry.createdAt.toISOString(),
      })),
    }
  },

  async getOAuthClient(clientId) {
    const row = await prisma.oauthClient.findUnique({
      where: { clientId },
      select: OAUTH_CLIENT_SELECT,
    })
    return row ? oauthClient(row) : null
  },

  async setOAuthClientDisabled(clientId, input) {
    const existing = await prisma.oauthClient.findUnique({
      where: { clientId },
      select: OAUTH_CLIENT_SELECT,
    })
    if (!existing) return null
    const updated = await prisma.oauthClient.update({
      where: { clientId },
      data: { disabled: input.disabled },
      select: OAUTH_CLIENT_SELECT,
    })
    return oauthClient(updated)
  },

  async listSupportTickets({ status, limit }) {
    const take =
      limit && limit > 0
        ? Math.min(Math.floor(limit), SUPPORT_TICKET_LIMIT)
        : SUPPORT_TICKET_LIMIT
    const rows = await prisma.supportTicket.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take,
      select: SUPPORT_TICKET_SELECT,
    })
    return { items: rows.map(supportTicket) }
  },

  async getSupportTicket(id) {
    const row = await prisma.supportTicket.findUnique({
      where: { id },
      select: SUPPORT_TICKET_SELECT,
    })
    return row ? supportTicket(row) : null
  },

  async updateSupportTicket(id, input) {
    const existing = await prisma.supportTicket.findUnique({
      where: { id },
      select: { acknowledgedAt: true },
    })
    if (!existing) return null
    const now = new Date()
    const row = await prisma.supportTicket.update({
      where: { id },
      data: {
        ...(input.assigneeEmail !== undefined
          ? { assigneeEmail: input.assigneeEmail }
          : {}),
        ...(input.status
          ? {
              status: input.status,
              // Keep the first acknowledgement: it is what the response
              // target is measured against.
              acknowledgedAt:
                input.status === "open"
                  ? null
                  : (existing.acknowledgedAt ?? now),
              resolvedAt: input.status === "resolved" ? now : null,
            }
          : {}),
      },
      select: SUPPORT_TICKET_SELECT,
    })
    return supportTicket(row)
  },
}
