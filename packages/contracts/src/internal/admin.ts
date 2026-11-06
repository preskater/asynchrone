import { z } from "zod"

/**
 * Control-tower administration contracts.
 *
 * These endpoints are hosted by Copilot (which owns identity) and called by the
 * control tower with `internal:identity:admin`. Platform mutations remain the
 * caller's responsibility to audit in `PlatformAuditEvent`.
 *
 * The control tower keeps its own database for platform auth, 2FA, audit and
 * handoff state (ADR 0032); every customer read model — organizations, users,
 * plans, bans, members, sessions, OAuth clients, audit — comes from here.
 */

export const AdminOrganizationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string().min(1),
  plan: z.enum(["free", "team", "enterprise"]),
  subscriptionStatus: z.string().nullable(),
  manualOverride: z.boolean(),
  trialEndsAt: z.string().datetime().nullable(),
  deletionScheduledAt: z.string().datetime().nullable(),
  memberCount: z.number().int().nonnegative(),
  storageQuotaBytes: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type AdminOrganization = z.infer<typeof AdminOrganizationSchema>

export const AdminOrganizationPageSchema = z.object({
  items: z.array(AdminOrganizationSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
})
export type AdminOrganizationPage = z.infer<typeof AdminOrganizationPageSchema>

export const AdminUserSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  role: z.string().nullable(),
  banned: z.boolean(),
  banReason: z.string().nullable(),
  twoFactorEnabled: z.boolean(),
  lastSeenAt: z.string().datetime().nullable(),
  /** Workspace and portal memberships. */
  organizationCount: z.number().int().nonnegative(),
  /** Latest activity of any session, active or expired. */
  lastSessionAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
export type AdminUser = z.infer<typeof AdminUserSchema>

export const AdminUserPageSchema = z.object({
  items: z.array(AdminUserSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
})
export type AdminUserPage = z.infer<typeof AdminUserPageSchema>

export const AdminSubscriptionSchema = z.object({
  plan: z.string(),
  status: z.string(),
  provider: z.string(),
  billingInterval: z.string().nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  trialEndsAt: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  manualOverride: z.boolean(),
  providerCustomerId: z.string().nullable(),
  providerSubscriptionId: z.string().nullable(),
  updatedAt: z.string().datetime(),
})
export type AdminSubscription = z.infer<typeof AdminSubscriptionSchema>

export const AdminMemberSchema = z.object({
  id: z.string().min(1),
  role: z.string(),
  /** Set for client-portal accounts. */
  clientId: z.string().nullable(),
  createdAt: z.string().datetime(),
  user: z.object({
    id: z.string().min(1),
    name: z.string(),
    email: z.string().email(),
    emailVerified: z.boolean(),
    banned: z.boolean(),
  }),
})
export type AdminMember = z.infer<typeof AdminMemberSchema>

export const AdminOAuthClientSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().nullable(),
  disabled: z.boolean(),
  /** Owner when the client was registered by a user through MCP. */
  userId: z.string().nullable(),
  referenceId: z.string().nullable(),
  createdAt: z.string().datetime().nullable(),
})
export type AdminOAuthClient = z.infer<typeof AdminOAuthClientSchema>

export const AdminAiUsageSchema = z.object({
  costMicros: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  runs: z.number().int().nonnegative(),
})
export type AdminAiUsage = z.infer<typeof AdminAiUsageSchema>

/** Organization detail page: identity-owned data only. */
export const AdminOrganizationDetailSchema = AdminOrganizationSchema.extend({
  trialStartedAt: z.string().datetime().nullable(),
  subscription: AdminSubscriptionSchema.nullable(),
  /** Members without a client portal link; portal accounts take no seat. */
  seatCount: z.number().int().nonnegative(),
  members: z.array(AdminMemberSchema),
  oauthClients: z.array(AdminOAuthClientSchema),
  recentAudit: z.array(
    z.object({
      id: z.string().min(1),
      action: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      actorId: z.string(),
      createdAt: z.string().datetime(),
    })
  ),
  /** AI spend of the current UTC month. */
  aiUsage: AdminAiUsageSchema,
  /** AI spend of the previous UTC month, cost only. */
  previousMonthAiCostMicros: z.number().int().nonnegative(),
})
export type AdminOrganizationDetail = z.infer<
  typeof AdminOrganizationDetailSchema
>

export const AdminSessionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  impersonatedBy: z.string().nullable(),
})
export type AdminSession = z.infer<typeof AdminSessionSchema>

/** User detail page: identity-owned data only. */
export const AdminUserDetailSchema = AdminUserSchema.extend({
  memberships: z.array(
    z.object({
      id: z.string().min(1),
      role: z.string(),
      clientId: z.string().nullable(),
      createdAt: z.string().datetime(),
      organization: z.object({
        id: z.string().min(1),
        name: z.string(),
        slug: z.string(),
      }),
    })
  ),
  sessions: z.array(AdminSessionSchema),
  accounts: z.array(
    z.object({
      providerId: z.string(),
      createdAt: z.string().datetime(),
    })
  ),
  oauthClients: z.array(AdminOAuthClientSchema),
})
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>

export const AdminOverviewSchema = z.object({
  organizations: z.number().int().nonnegative(),
  users: z.number().int().nonnegative(),
  activeSessions: z.number().int().nonnegative(),
  newestOrganizations: z.array(AdminOrganizationSchema),
})
export type AdminOverview = z.infer<typeof AdminOverviewSchema>

export const AdminOpsSchema = z.object({
  sessions: z.object({
    active: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
  }),
  invitations: z.object({
    pending: z.number().int().nonnegative(),
  }),
  signingKeys: z.array(
    z.object({
      id: z.string().min(1),
      alg: z.string().nullable(),
      createdAt: z.string().datetime(),
      expiresAt: z.string().datetime().nullable(),
    })
  ),
  oauthClients: z.object({
    total: z.number().int().nonnegative(),
    disabled: z.number().int().nonnegative(),
  }),
  /** AI spend over `windowDays`. */
  aiUsage: AdminAiUsageSchema.extend({
    windowDays: z.number().int().positive(),
  }),
})
export type AdminOps = z.infer<typeof AdminOpsSchema>

export const AdminAuditEntrySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  organizationName: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  entityLabel: z.string().nullable(),
  actorId: z.string(),
  actorName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type AdminAuditEntry = z.infer<typeof AdminAuditEntrySchema>

export const AdminAuditPageSchema = z.object({
  items: z.array(AdminAuditEntrySchema),
})
export type AdminAuditPage = z.infer<typeof AdminAuditPageSchema>

export const AdminOAuthClientDisabledInputSchema = z.object({
  disabled: z.boolean(),
})
export type AdminOAuthClientDisabledInput = z.infer<
  typeof AdminOAuthClientDisabledInputSchema
>

export const AdminPlanInputSchema = z.object({
  plan: z.enum(["free", "team", "enterprise"]),
  quotaBytes: z.number().int().positive().nullable(),
})
export type AdminPlanInput = z.infer<typeof AdminPlanInputSchema>

export const AdminTrialInputSchema = z.object({
  /** End the trial now instead of starting one. */
  end: z.boolean().default(false),
  days: z.number().int().min(1).max(365).default(14),
})
export type AdminTrialInput = z.infer<typeof AdminTrialInputSchema>

export const AdminBanInputSchema = z.object({
  banned: z.boolean(),
  reason: z.string().trim().max(500).optional(),
})
export type AdminBanInput = z.infer<typeof AdminBanInputSchema>

export const AdminHandoffInputSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1).optional(),
  /** Control-tower operator starting the impersonation. */
  actorId: z.string().min(1).optional(),
})
export type AdminHandoffInput = z.infer<typeof AdminHandoffInputSchema>

export const AdminSessionRevokeResultSchema = z.object({
  deleted: z.number().int().nonnegative(),
})
export type AdminSessionRevokeResult = z.infer<
  typeof AdminSessionRevokeResultSchema
>

export const AdminHandoffResultSchema = z.object({
  /** Single-use handoff URL on the customer app. */
  url: z.string().url(),
})
export type AdminHandoffResult = z.infer<typeof AdminHandoffResultSchema>

/** Support ticket lifecycle (#101): created → acknowledged → resolved. */
export const SUPPORT_TICKET_STATUSES = [
  "open",
  "acknowledged",
  "resolved",
] as const
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number]

export const AdminSupportTicketSchema = z.object({
  id: z.string().min(1),
  number: z.number().int(),
  status: z.enum(SUPPORT_TICKET_STATUSES),
  organizationId: z.string().min(1),
  organizationName: z.string(),
  organizationSlug: z.string(),
  /** Effective plan at read time; drives the response target. */
  plan: z.string(),
  userId: z.string().min(1),
  userName: z.string().nullable(),
  category: z.string(),
  impact: z.string(),
  title: z.string(),
  description: z.string(),
  contactEmail: z.string(),
  allowContact: z.boolean(),
  details: z.record(z.string(), z.unknown()),
  context: z.record(z.string(), z.unknown()),
  assigneeEmail: z.string().nullable(),
  acknowledgedAt: z.string().datetime().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type AdminSupportTicket = z.infer<typeof AdminSupportTicketSchema>

export const AdminSupportTicketPageSchema = z.object({
  items: z.array(AdminSupportTicketSchema),
})
export type AdminSupportTicketPage = z.infer<
  typeof AdminSupportTicketPageSchema
>

export const AdminSupportTicketUpdateSchema = z
  .object({
    status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
    /** Operator email; `null` unassigns. */
    assigneeEmail: z.string().email().max(200).nullable().optional(),
  })
  .refine(
    (input) => input.status !== undefined || input.assigneeEmail !== undefined,
    "Nothing to update"
  )
export type AdminSupportTicketUpdate = z.infer<
  typeof AdminSupportTicketUpdateSchema
>
