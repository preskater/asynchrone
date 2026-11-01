import { z } from "zod"

/**
 * Versioned contracts for `/internal/*`.
 *
 * Internal APIs are private, service-to-service endpoints. A caller must hold a
 * client-credentials token whose audience is the target app and whose scope
 * covers the operation. These schemas are the single source of truth for both
 * the handler and the typed caller.
 */

export const INTERNAL_API_VERSION = "v1" as const
export const INTERNAL_BASE_PATH = `/internal/${INTERNAL_API_VERSION}` as const

export function internalPath(...segments: string[]): string {
  const suffix = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/")
  return suffix ? `${INTERNAL_BASE_PATH}/${suffix}` : INTERNAL_BASE_PATH
}

export const INTERNAL_ROUTES = {
  identityOrganization: (organizationId: string) =>
    internalPath("organizations", organizationId),
  identityMembers: (organizationId: string) =>
    internalPath("organizations", organizationId, "members"),
  identityEntitlements: (organizationId: string) =>
    internalPath("organizations", organizationId, "entitlements"),
  identityUser: (userId: string) => internalPath("users", userId),
  audit: internalPath("audit"),
  auditExport: internalPath("audit", "export"),
  auditFacets: internalPath("audit", "facets"),
  auditPrune: internalPath("audit", "prune"),
  search: internalPath("search"),
  notifications: internalPath("notifications"),
  exportOrganization: (organizationId: string) =>
    internalPath("organizations", organizationId, "export"),
  deleteOrganization: (organizationId: string) =>
    internalPath("organizations", organizationId),
  deleteUser: (userId: string) => internalPath("users", userId),
  adminOrganizations: internalPath("admin", "organizations"),
  adminOrganization: (organizationId: string) =>
    internalPath("admin", "organizations", organizationId),
  adminOrganizationDetail: (organizationId: string) =>
    internalPath("admin", "organizations", organizationId, "detail"),
  adminOrganizationPlan: (organizationId: string) =>
    internalPath("admin", "organizations", organizationId, "plan"),
  adminOrganizationReleasePlan: (organizationId: string) =>
    internalPath("admin", "organizations", organizationId, "release-plan"),
  adminOrganizationTrial: (organizationId: string) =>
    internalPath("admin", "organizations", organizationId, "trial"),
  adminUsers: internalPath("admin", "users"),
  adminUser: (userId: string) => internalPath("admin", "users", userId),
  adminUserDetail: (userId: string) =>
    internalPath("admin", "users", userId, "detail"),
  adminUserBan: (userId: string) =>
    internalPath("admin", "users", userId, "ban"),
  adminUserSessions: (userId: string) =>
    internalPath("admin", "users", userId, "sessions"),
  adminHandoffs: internalPath("admin", "handoffs"),
  adminOverview: internalPath("admin", "overview"),
  adminOps: internalPath("admin", "ops"),
  adminAudit: internalPath("admin", "audit"),
  adminOAuthClient: (clientId: string) =>
    internalPath("admin", "oauth-clients", clientId),
} as const

export const SERVICE_SCOPES = {
  identityRead: "internal:identity:read",
  identityAdmin: "internal:identity:admin",
  auditRead: "internal:audit:read",
  auditWrite: "internal:audit:write",
  searchRead: "internal:search:read",
  notificationsWrite: "internal:notifications:write",
  exportRead: "internal:export:read",
  deleteWrite: "internal:delete:write",
  domainRead: "internal:domain:read",
  domainWrite: "internal:domain:write",
} as const

export type ServiceScope = (typeof SERVICE_SCOPES)[keyof typeof SERVICE_SCOPES]

/** Claims expected on a short-lived client-credentials access token. */
export const ServiceTokenClaimsSchema = z.object({
  iss: z.string().url(),
  sub: z.string().min(1),
  aud: z.string().min(1),
  scope: z.string().min(1),
  exp: z.number().int(),
  iat: z.number().int().optional(),
  client_id: z.string().min(1),
  jti: z.string().min(1).optional(),
})
export type ServiceTokenClaims = z.infer<typeof ServiceTokenClaimsSchema>

export const MemberRoleSchema = z.enum([
  "owner",
  "admin",
  "member",
  "viewer",
  "client",
])
export type MemberRole = z.infer<typeof MemberRoleSchema>

export const UserSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url().nullable().optional(),
})
export type IdentityUser = z.infer<typeof UserSchema>

export const MemberSchema = UserSchema.extend({
  role: MemberRoleSchema,
  /** Set for client-portal accounts; they never enter the internal workspace. */
  clientId: z.string().nullable().optional(),
})
export type Member = z.infer<typeof MemberSchema>

export const OrganizationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string().min(1),
})
export type Organization = z.infer<typeof OrganizationSchema>

export const EntitlementsSchema = z.object({
  plan: z.enum(["free", "team", "enterprise"]),
  /** `null` means unlimited. */
  seats: z.number().int().nonnegative().nullable(),
  storageBytes: z.number().int().nonnegative(),
  aiBudgetMicrosPerSeat: z.number().int().nonnegative(),
  auditLog: z.boolean(),
  sso: z.boolean(),
  requireTwoFactor: z.boolean(),
  granularPermissions: z.boolean(),
  apiAccess: z.boolean(),
  scim: z.boolean(),
})
export type Entitlements = z.infer<typeof EntitlementsSchema>

export const IdentityContextSchema = z.object({
  organization: OrganizationSchema,
  member: MemberSchema,
  entitlements: EntitlementsSchema,
})
export type IdentityContext = z.infer<typeof IdentityContextSchema>

export const SearchResultSchema = z.object({
  app: z.string().min(1),
  type: z.string().min(1),
  id: z.string().min(1),
  title: z.string(),
  subtitle: z.string().optional(),
  url: z.string().min(1),
})
export type SearchResult = z.infer<typeof SearchResultSchema>

export const SearchQuerySchema = z.object({
  organizationId: z.string().min(1),
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(20),
})
export type SearchQuery = z.infer<typeof SearchQuerySchema>

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
})
export type SearchResponse = z.infer<typeof SearchResponseSchema>

export const NotificationInputSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  url: z.string().optional(),
  /** Makes retries safe; the receiver must deduplicate on this key. */
  idempotencyKey: z.string().min(1),
})
export type NotificationInput = z.infer<typeof NotificationInputSchema>

export const NotificationResultSchema = z.object({
  /** False when the idempotency key had already been used. */
  created: z.boolean(),
})
export type NotificationResult = z.infer<typeof NotificationResultSchema>

export const ExportManifestSchema = z.object({
  app: z.string().min(1),
  appVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  generatedAt: z.coerce.date(),
  tables: z.record(z.string(), z.number().int().nonnegative()),
})
export type ExportManifest = z.infer<typeof ExportManifestSchema>

export const ExportPartSchema = z.object({
  manifest: ExportManifestSchema,
  /** One array per exported table, already scoped to the organization. */
  data: z.record(z.string(), z.array(z.unknown())),
})
export type ExportPart = z.infer<typeof ExportPartSchema>

export const DeletionResultSchema = z.object({
  app: z.string().min(1),
  organizationId: z.string().min(1),
  userId: z.string().optional(),
  deleted: z.record(z.string(), z.number().int().nonnegative()),
  completedAt: z.coerce.date(),
})
export type DeletionResult = z.infer<typeof DeletionResultSchema>

export const InternalErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().optional(),
})
export type InternalError = z.infer<typeof InternalErrorSchema>

/** Standard success envelope for an internal endpoint. */
export function internalEnvelope<T extends z.ZodType>(data: T) {
  return z.object({
    data,
    meta: z
      .object({
        app: z.string().min(1),
        version: z.literal(INTERNAL_API_VERSION),
        requestId: z.string().min(1),
      })
      .optional(),
  })
}
