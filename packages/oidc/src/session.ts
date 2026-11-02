import { normalizeConfig, type OidcConfig } from "./config"
import {
  claimOrganizationId,
  verifyAccessToken,
  type AccessTokenClaims,
} from "./jwks"
import { refreshAccessToken, type OidcFetch, type TokenResponse } from "./token"

/** Impersonation sessions are capped independently of the app session. */
export const IMPERSONATION_TTL_MS = 60 * 60 * 1000

/**
 * Storage contract for an app-local OIDC session. Each app stores the row in
 * its own database; `#183` provides the Prisma adapter, and this package ships
 * an in-memory implementation for tests.
 */
export interface OidcSessionRecord {
  id: string
  /** Copilot user id (`sub`). */
  userId: string
  /** Copilot organization id from the token claim. */
  organizationId: string
  /** Copilot session id used by back-channel logout. */
  sid: string
  accessToken: string
  refreshToken: string | null
  /** Unix milliseconds. */
  accessTokenExpiresAt: number
  createdAt: number
  updatedAt: number
  /**
   * Claims verified from the current access token. In-memory only: the store
   * never persists them, and `resolveSession` refreshes them on every request.
   */
  claims?: AccessTokenClaims
}

export type OidcSessionPatch = Partial<
  Pick<
    OidcSessionRecord,
    "accessToken" | "refreshToken" | "accessTokenExpiresAt" | "updatedAt"
  >
>

export interface OidcSessionStore {
  create(record: OidcSessionRecord): Promise<void>
  get(id: string): Promise<OidcSessionRecord | null>
  update(id: string, patch: OidcSessionPatch): Promise<void>
  delete(id: string): Promise<void>
  deleteBySid(sid: string): Promise<void>
}

export class MemorySessionStore implements OidcSessionStore {
  private readonly sessions = new Map<string, OidcSessionRecord>()

  async create(record: OidcSessionRecord): Promise<void> {
    this.sessions.set(record.id, record)
  }

  async get(id: string): Promise<OidcSessionRecord | null> {
    return this.sessions.get(id) ?? null
  }

  async update(id: string, patch: OidcSessionPatch): Promise<void> {
    const current = this.sessions.get(id)
    if (current) this.sessions.set(id, { ...current, ...patch })
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id)
  }

  async deleteBySid(sid: string): Promise<void> {
    for (const [id, record] of this.sessions) {
      if (record.sid === sid) this.sessions.delete(id)
    }
  }
}

export interface CreateSessionInput {
  tokens: TokenResponse
  userId: string
  organizationId: string
  sid: string
  id?: string
  now?: number
  /** Claims from the access token, kept for the current request. */
  claims?: AccessTokenClaims
}

export function sessionRecordFromTokens({
  tokens,
  userId,
  organizationId,
  sid,
  id,
  now = Date.now(),
  claims,
}: CreateSessionInput): OidcSessionRecord {
  return {
    id: id ?? crypto.randomUUID(),
    userId,
    organizationId,
    sid,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    accessTokenExpiresAt: tokens.expires_at,
    createdAt: now,
    updatedAt: now,
    ...(claims ? { claims } : {}),
  }
}

export async function createSession(
  store: OidcSessionStore,
  input: CreateSessionInput
): Promise<OidcSessionRecord> {
  const record = sessionRecordFromTokens(input)
  await store.create(record)
  return record
}

/**
 * Why a stored session no longer matches its access token. Any mismatch is a
 * context change (another user, another Copilot sign-in or another
 * organization) and ends the local session.
 */
export type SessionClaimMismatch =
  "subject_mismatch" | "sid_mismatch" | "organization_mismatch"

/** Compare the verified token claims with the persisted session binding. */
export function sessionClaimMismatch(
  claims: AccessTokenClaims,
  record: Pick<OidcSessionRecord, "userId" | "organizationId" | "sid">
): SessionClaimMismatch | null {
  if (claims.sub !== record.userId) return "subject_mismatch"
  if (typeof claims.sid !== "string" || claims.sid !== record.sid) {
    return "sid_mismatch"
  }
  const organizationId = claimOrganizationId(claims)
  if (!organizationId || organizationId !== record.organizationId) {
    return "organization_mismatch"
  }
  return null
}

/**
 * The impersonation TTL is fixed at one hour from the Copilot session's
 * creation, regardless of the app session or of a refreshed token.
 */
export function impersonationExpired({
  impersonatedBy,
  createdAt,
  now = Date.now(),
  ttlMs = IMPERSONATION_TTL_MS,
}: {
  impersonatedBy: string | null | undefined
  createdAt: number
  now?: number
  ttlMs?: number
}): boolean {
  if (!impersonatedBy) return false
  return createdAt + ttlMs <= now
}

export interface ResolveSessionOptions {
  fetchImpl?: OidcFetch
  now?: number
  /** Refresh this many milliseconds before expiry. Defaults to 30 seconds. */
  refreshSkewMs?: number
  /** Injectable for tests; defaults to Copilot JWKS verification. */
  verify?: (token: string) => Promise<AccessTokenClaims>
  /**
   * Verify the access token's signature, issuer, audience, expiry and binding
   * on every resolve. Defaults to true; only tests should turn it off.
   */
  enforceClaims?: boolean
}

/**
 * Load a session, refresh it when the access token is near expiry, and verify
 * the refreshed token against Copilot.
 *
 * A failed refresh, an invalid token (wrong issuer/audience/signature/expiry)
 * or a token bound to another user, sign-in or organization deletes the local
 * session and returns null; the caller redirects to Copilot. Verification
 * fails closed: if Copilot's JWKS is unreachable, the local session is not
 * trusted.
 *
 * Concurrent requests for the same session are tolerated: when one request
 * wins the refresh-token rotation the others keep its token instead of signing
 * the user out, and a delete that another request already performed is not an
 * error.
 */
export async function resolveSession(
  store: OidcSessionStore,
  config: OidcConfig,
  sessionId: string,
  {
    fetchImpl = fetch,
    now = Date.now(),
    refreshSkewMs = 30_000,
    verify = (token) => verifyAccessToken(config, token),
    enforceClaims = true,
  }: ResolveSessionOptions = {}
): Promise<OidcSessionRecord | null> {
  const record = await store.get(sessionId)
  if (!record) return null

  let current = record
  if (record.accessTokenExpiresAt <= now + refreshSkewMs) {
    if (!record.refreshToken) {
      await dropSession(store, record.id)
      return null
    }

    try {
      const tokens = await refreshAccessToken(config, {
        refreshToken: record.refreshToken,
        fetchImpl,
        now,
      })
      const updated = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? record.refreshToken,
        accessTokenExpiresAt: tokens.expires_at,
        updatedAt: now,
      }
      await store.update(record.id, updated)
      current = { ...record, ...updated }
    } catch {
      // Two requests of the same page (the router's prefetch plus the
      // navigation, or two tabs) can race here. Copilot rotates the refresh
      // token, so the loser's grant fails while the winner may still be
      // writing. Give the winner a moment to commit and continue with its
      // token instead of signing the user out.
      const latest = await awaitedConcurrentRefresh(
        store,
        record.id,
        now,
        refreshSkewMs
      )
      if (latest) {
        current = latest
      } else {
        await dropSession(store, record.id)
        return null
      }
    }
  }

  if (!enforceClaims) return current

  let claims: AccessTokenClaims
  try {
    claims = await verify(current.accessToken)
  } catch {
    await dropSession(store, current.id)
    return null
  }

  if (sessionClaimMismatch(claims, current)) {
    await dropSession(store, current.id)
    return null
  }

  return { ...current, claims }
}

/**
 * Delete a rejected session, tolerating a concurrent request that already did.
 * The failure is deliberate (never trust the session), not an error to surface
 * as a 500.
 */
async function dropSession(
  store: OidcSessionStore,
  sessionId: string
): Promise<void> {
  try {
    await store.delete(sessionId)
  } catch {
    // Already gone: another request resolved the same session first.
  }
}

/** Backoff between re-reads when a concurrent refresh is probably landing. */
const CONCURRENT_REFRESH_DELAYS_MS = [0, 50, 150]

/**
 * Re-read the session after a failed refresh, waiting briefly for a concurrent
 * request that won the rotation to store its token.
 */
async function awaitedConcurrentRefresh(
  store: OidcSessionStore,
  sessionId: string,
  now: number,
  refreshSkewMs: number
): Promise<OidcSessionRecord | null> {
  for (const delay of CONCURRENT_REFRESH_DELAYS_MS) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
    const latest = await store.get(sessionId).catch(() => null)
    if (latest && latest.accessTokenExpiresAt > now + refreshSkewMs) {
      return latest
    }
  }
  return null
}

/** Remove every local session bound to a Copilot session id. */
export async function deleteSessionsBySid(
  store: OidcSessionStore,
  sid: string
): Promise<void> {
  await store.deleteBySid(sid)
}

/** The local session id is not the Copilot session id. */
export function isSecureSessionCookie(config: OidcConfig): boolean {
  return normalizeConfig(config).secureCookies
}
