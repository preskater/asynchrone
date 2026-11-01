import { internalAudience } from "../apps"
import {
  INTERNAL_ROUTES,
  InternalErrorSchema,
  SERVICE_SCOPES,
} from "../internal/contracts"
import {
  AdminAuditPageSchema,
  AdminBanInputSchema,
  AdminHandoffInputSchema,
  AdminHandoffResultSchema,
  AdminOAuthClientDisabledInputSchema,
  AdminOAuthClientSchema,
  AdminOpsSchema,
  AdminOrganizationDetailSchema,
  AdminOrganizationPageSchema,
  AdminOrganizationSchema,
  AdminOverviewSchema,
  AdminPlanInputSchema,
  AdminSessionRevokeResultSchema,
  AdminTrialInputSchema,
  AdminUserDetailSchema,
  AdminUserPageSchema,
  AdminUserSchema,
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
  type AdminTrialInput,
  type AdminUser,
  type AdminUserDetail,
  type AdminUserPage,
} from "../internal/admin"

/** Paging for the organization and user lists. `offset` backs page numbers. */
export interface AdminListInput {
  query?: string
  cursor?: string | null
  offset?: number
  limit?: number
}

export interface IdentityAdminClientOptions {
  /** Customer app (Copilot) origin. */
  baseUrl: string
  getToken: (request: { audience: string; scopes: string[] }) => Promise<string>
  fetchImpl?: typeof fetch
}

export class IdentityAdminClientError extends Error {
  readonly status: number
  readonly code: string

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = "IdentityAdminClientError"
    this.code = code
    this.status = status
  }
}

/** Typed control-tower client for Copilot's identity admin API. */
export class IdentityAdminClient {
  private readonly options: IdentityAdminClientOptions
  private readonly audience = internalAudience("copilot")

  constructor(options: IdentityAdminClientOptions) {
    this.options = { fetchImpl: fetch, ...options }
  }

  private async request(
    path: string,
    init: RequestInit = {},
    schema?: { parse: (value: unknown) => unknown }
  ): Promise<unknown> {
    const response = await (this.options.fetchImpl ?? fetch)(
      new URL(path, this.options.baseUrl),
      {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${await this.options.getToken({
            audience: this.audience,
            scopes: [SERVICE_SCOPES.identityAdmin],
          })}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
        cache: "no-store",
      }
    )
    const body = (await response.json().catch(() => null)) as unknown
    if (!response.ok) {
      const parsed = InternalErrorSchema.safeParse(
        typeof body === "object" && body && "error" in body
          ? (body as { error: unknown }).error
          : body
      )
      throw new IdentityAdminClientError(
        parsed.success ? parsed.data.code : "admin_request_failed",
        parsed.success
          ? parsed.data.message
          : `Admin API returned ${response.status}`,
        response.status
      )
    }
    if (!body || typeof body !== "object" || !("data" in body)) {
      throw new IdentityAdminClientError(
        "invalid_response",
        "Admin API response has no data",
        502
      )
    }
    const data = (body as { data: unknown }).data
    return schema ? schema.parse(data) : data
  }

  private query(input: AdminListInput): string {
    const search = new URLSearchParams()
    if (input.query) search.set("query", input.query)
    if (input.cursor) search.set("cursor", input.cursor)
    if (input.offset) search.set("offset", String(input.offset))
    if (input.limit) search.set("limit", String(input.limit))
    return search.toString()
  }

  listOrganizations(
    input: AdminListInput = {}
  ): Promise<AdminOrganizationPage> {
    return this.request(
      `${INTERNAL_ROUTES.adminOrganizations}?${this.query(input)}`,
      {},
      AdminOrganizationPageSchema
    ) as Promise<AdminOrganizationPage>
  }

  getOrganization(organizationId: string): Promise<AdminOrganization> {
    return this.request(
      INTERNAL_ROUTES.adminOrganization(organizationId),
      {},
      AdminOrganizationSchema
    ) as Promise<AdminOrganization>
  }

  /** Organization detail page: members, OAuth clients, audit, AI usage. */
  getOrganizationDetail(
    organizationId: string
  ): Promise<AdminOrganizationDetail> {
    return this.request(
      INTERNAL_ROUTES.adminOrganizationDetail(organizationId),
      {},
      AdminOrganizationDetailSchema
    ) as Promise<AdminOrganizationDetail>
  }

  updatePlan(
    organizationId: string,
    input: AdminPlanInput
  ): Promise<AdminOrganization> {
    return this.request(
      INTERNAL_ROUTES.adminOrganizationPlan(organizationId),
      {
        method: "POST",
        body: JSON.stringify(AdminPlanInputSchema.parse(input)),
      },
      AdminOrganizationSchema
    ) as Promise<AdminOrganization>
  }

  releasePlan(organizationId: string): Promise<AdminOrganization> {
    return this.request(
      INTERNAL_ROUTES.adminOrganizationReleasePlan(organizationId),
      { method: "POST", body: "{}" },
      AdminOrganizationSchema
    ) as Promise<AdminOrganization>
  }

  setTrial(
    organizationId: string,
    input: AdminTrialInput
  ): Promise<AdminOrganization> {
    return this.request(
      INTERNAL_ROUTES.adminOrganizationTrial(organizationId),
      {
        method: "POST",
        body: JSON.stringify(AdminTrialInputSchema.parse(input)),
      },
      AdminOrganizationSchema
    ) as Promise<AdminOrganization>
  }

  listUsers(input: AdminListInput = {}): Promise<AdminUserPage> {
    return this.request(
      `${INTERNAL_ROUTES.adminUsers}?${this.query(input)}`,
      {},
      AdminUserPageSchema
    ) as Promise<AdminUserPage>
  }

  getUser(userId: string): Promise<AdminUser> {
    return this.request(
      INTERNAL_ROUTES.adminUser(userId),
      {},
      AdminUserSchema
    ) as Promise<AdminUser>
  }

  /** User detail page: memberships, sessions, linked accounts, OAuth clients. */
  getUserDetail(userId: string): Promise<AdminUserDetail> {
    return this.request(
      INTERNAL_ROUTES.adminUserDetail(userId),
      {},
      AdminUserDetailSchema
    ) as Promise<AdminUserDetail>
  }

  setBan(userId: string, input: AdminBanInput): Promise<AdminUser> {
    return this.request(
      INTERNAL_ROUTES.adminUserBan(userId),
      {
        method: "POST",
        body: JSON.stringify(AdminBanInputSchema.parse(input)),
      },
      AdminUserSchema
    ) as Promise<AdminUser>
  }

  revokeSessions(userId: string): Promise<AdminSessionRevokeResult> {
    return this.request(
      INTERNAL_ROUTES.adminUserSessions(userId),
      { method: "POST", body: "{}" },
      AdminSessionRevokeResultSchema
    ) as Promise<AdminSessionRevokeResult>
  }

  createHandoff(input: AdminHandoffInput): Promise<AdminHandoffResult> {
    return this.request(
      INTERNAL_ROUTES.adminHandoffs,
      {
        method: "POST",
        body: JSON.stringify(AdminHandoffInputSchema.parse(input)),
      },
      AdminHandoffResultSchema
    ) as Promise<AdminHandoffResult>
  }

  overview(): Promise<AdminOverview> {
    return this.request(
      INTERNAL_ROUTES.adminOverview,
      {},
      AdminOverviewSchema
    ) as Promise<AdminOverview>
  }

  ops(): Promise<AdminOps> {
    return this.request(
      INTERNAL_ROUTES.adminOps,
      {},
      AdminOpsSchema
    ) as Promise<AdminOps>
  }

  /** Latest customer audit rows across every organization. */
  listAudit(input: { limit?: number } = {}): Promise<AdminAuditPage> {
    const search = new URLSearchParams()
    if (input.limit) search.set("limit", String(input.limit))
    return this.request(
      `${INTERNAL_ROUTES.adminAudit}?${search}`,
      {},
      AdminAuditPageSchema
    ) as Promise<AdminAuditPage>
  }

  getOAuthClient(clientId: string): Promise<AdminOAuthClient | null> {
    return this.request(
      INTERNAL_ROUTES.adminOAuthClient(clientId),
      {},
      AdminOAuthClientSchema
    ) as Promise<AdminOAuthClient>
  }

  setOAuthClientDisabled(
    clientId: string,
    input: AdminOAuthClientDisabledInput
  ): Promise<AdminOAuthClient> {
    return this.request(
      INTERNAL_ROUTES.adminOAuthClient(clientId),
      {
        method: "POST",
        body: JSON.stringify(AdminOAuthClientDisabledInputSchema.parse(input)),
      },
      AdminOAuthClientSchema
    ) as Promise<AdminOAuthClient>
  }
}
