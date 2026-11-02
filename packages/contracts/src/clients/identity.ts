import {
  AddWorkspaceMemberSchema,
  INTERNAL_ROUTES,
  IntegrationTokenSchema,
  InternalErrorSchema,
  MemberSchema,
  OrganizationAppearanceSchema,
  OrganizationSchema,
  PortalAccessSchema,
  PresenceEntrySchema,
  EntitlementsSchema,
  SERVICE_SCOPES,
  UpdateWorkspaceMemberSchema,
  UserSchema,
  WorkspaceSchema,
  type AddWorkspaceMember,
  type Entitlements,
  type IdentityUser,
  type IntegrationToken,
  type Member,
  type Organization,
  type OrganizationAppearanceMetadata,
  type PortalAccess,
  type PresenceEntry,
  type UpdateWorkspaceMember,
  type Workspace,
} from "../internal/contracts"
import { internalAudience } from "../apps"

/**
 * Typed client for Copilot's identity internal API.
 *
 * The caller supplies a service-token getter so this package does not depend on
 * `@workspace/service-auth` (which depends on contracts). Results are cached
 * briefly; call `invalidate` after a member or role mutation.
 */

export interface IdentityClientOptions {
  /** Copilot origin, e.g. `https://copilot.asynchrone.space`. */
  baseUrl: string
  /** Return a client-credentials token for the requested audience/scopes. */
  getToken: (request: { audience: string; scopes: string[] }) => Promise<string>
  fetchImpl?: typeof fetch
  ttlMs?: number
  now?: () => number
}

export class IdentityClientError extends Error {
  readonly status: number
  readonly code: string

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = "IdentityClientError"
    this.code = code
    this.status = status
  }
}

interface CacheEntry {
  value: unknown
  expiresAt: number
}

export class IdentityClient {
  private readonly options: IdentityClientOptions
  private readonly cache = new Map<string, CacheEntry>()
  private readonly audience = internalAudience("copilot")

  constructor(options: IdentityClientOptions) {
    this.options = {
      ttlMs: 30_000,
      fetchImpl: fetch,
      now: Date.now,
      ...options,
    }
  }

  private async token(write = false): Promise<string> {
    return this.options.getToken({
      audience: this.audience,
      scopes: [
        write ? SERVICE_SCOPES.identityWrite : SERVICE_SCOPES.identityRead,
      ],
    })
  }

  private async request<T>(
    path: string,
    schema: { parse: (value: unknown) => T },
    init: RequestInit = {},
    options: { cache?: boolean } = {}
  ): Promise<T> {
    const cacheable = options.cache !== false
    const now = this.options.now!()
    const cached = cacheable ? this.cache.get(path) : undefined
    if (cached && cached.expiresAt > now) return cached.value as T

    const response = await (this.options.fetchImpl ?? fetch)(
      new URL(path, this.options.baseUrl),
      {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${await this.token(
            init.method !== undefined && init.method !== "GET"
          )}`,
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
      throw new IdentityClientError(
        parsed.success ? parsed.data.code : "identity_request_failed",
        parsed.success
          ? parsed.data.message
          : `Identity API returned ${response.status}`,
        response.status
      )
    }
    if (!body || typeof body !== "object" || !("data" in body)) {
      throw new IdentityClientError(
        "invalid_response",
        "Identity API response has no data",
        502
      )
    }
    const value = schema.parse((body as { data: unknown }).data)
    if (cacheable) {
      this.cache.set(path, {
        value,
        expiresAt: this.options.now!() + (this.options.ttlMs ?? 30_000),
      })
    }
    return value
  }

  /** The workspace gate payload for a Copilot session and one organization. */
  getWorkspace(input: {
    sid: string
    organizationId: string
    locale?: string
  }): Promise<Workspace> {
    const search = new URLSearchParams({
      sid: input.sid,
      organizationId: input.organizationId,
    })
    if (input.locale) search.set("locale", input.locale)
    return this.request(
      `${INTERNAL_ROUTES.identityWorkspace}?${search.toString()}`,
      WorkspaceSchema,
      {},
      // The workspace carries the live session and its impersonation age;
      // caching it would let a revoked or expired session keep rendering.
      { cache: false }
    )
  }

  getOrganization(id: string): Promise<Organization> {
    return this.request(
      INTERNAL_ROUTES.identityOrganization(encodeURIComponent(id)),
      OrganizationSchema
    )
  }

  listMembers(organizationId: string): Promise<Member[]> {
    return this.request(
      INTERNAL_ROUTES.identityMembers(encodeURIComponent(organizationId)),
      { parse: (value) => MemberSchema.array().parse(value) }
    )
  }

  getUser(id: string): Promise<IdentityUser> {
    return this.request(
      INTERNAL_ROUTES.identityUser(encodeURIComponent(id)),
      UserSchema
    )
  }

  getEntitlements(organizationId: string): Promise<Entitlements> {
    return this.request(
      INTERNAL_ROUTES.identityEntitlements(encodeURIComponent(organizationId)),
      EntitlementsSchema
    )
  }

  listPresence(organizationId: string): Promise<PresenceEntry[]> {
    return this.request(
      INTERNAL_ROUTES.identityPresence(encodeURIComponent(organizationId)),
      PresenceEntrySchema.array()
    )
  }

  getAppearance(organizationId: string): Promise<OrganizationAppearanceMetadata> {
    return this.request(
      INTERNAL_ROUTES.identityAppearance(encodeURIComponent(organizationId)),
      OrganizationAppearanceSchema
    )
  }

  addMember(
    organizationId: string,
    input: AddWorkspaceMember
  ): Promise<Member> {
    return this.request(
      INTERNAL_ROUTES.identityMembers(encodeURIComponent(organizationId)),
      MemberSchema,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(AddWorkspaceMemberSchema.parse(input)),
      },
      { cache: false }
    )
  }

  updateMemberRole(
    organizationId: string,
    userId: string,
    input: UpdateWorkspaceMember
  ): Promise<Member> {
    return this.request(
      INTERNAL_ROUTES.identityMember(
        encodeURIComponent(organizationId),
        encodeURIComponent(userId)
      ),
      MemberSchema,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(UpdateWorkspaceMemberSchema.parse(input)),
      },
      { cache: false }
    )
  }

  removeMember(organizationId: string, userId: string): Promise<{ id: string }> {
    return this.request(
      INTERNAL_ROUTES.identityMember(
        encodeURIComponent(organizationId),
        encodeURIComponent(userId)
      ),
      { parse: (value) => value as { id: string } },
      { method: "DELETE" },
      { cache: false }
    )
  }

  getPortalAccess(
    organizationId: string,
    clientId: string
  ): Promise<PortalAccess> {
    const search = new URLSearchParams({ clientId })
    return this.request(
      `${INTERNAL_ROUTES.identityPortalAccess(
        encodeURIComponent(organizationId)
      )}?${search.toString()}`,
      PortalAccessSchema
    )
  }

  getIntegrationToken(
    userId: string,
    provider: string
  ): Promise<IntegrationToken> {
    return this.request(
      INTERNAL_ROUTES.identityUserIntegrationToken(
        encodeURIComponent(userId),
        encodeURIComponent(provider)
      ),
      IntegrationTokenSchema
    )
  }

  touchPresence(userId: string): Promise<{ at: Date }> {
    return this.request(
      INTERNAL_ROUTES.identityUserPresence(encodeURIComponent(userId)),
      { parse: (value) => value as { at: Date } },
      { method: "POST" },
      { cache: false }
    )
  }

  /** Drop one path, an organization subtree, or the whole cache. */
  invalidate(scope?: string): void {
    if (!scope) {
      this.cache.clear()
      return
    }
    for (const key of this.cache.keys()) {
      if (key.includes(scope)) this.cache.delete(key)
    }
  }
}
