import { Client, types } from "pg"

/**
 * Read/write helpers for the identity database.
 *
 * Every app still binds the shared `@workspace/db` client while the domain
 * databases are being cut over, so the Copilot session, the organization rows
 * and each app's `oidcSession` row all live in `DATABASE_URL`. The suite uses
 * `pg` directly (never `@workspace/db`) so Playwright workers can inspect and
 * age rows without booting an app-level Prisma client.
 */

// Prisma stores `DateTime` in `timestamp(3)` columns as UTC wall time.
// node-postgres parses those strings as *local* time, which shifts every
// comparison by the machine's UTC offset; parse them as UTC instead.
types.setTypeParser(1114, (value: string) => new Date(`${value}Z`))

export type DatabaseName = "identity" | "projects" | "calendars"

const ENV_BY_DATABASE: Record<DatabaseName, string> = {
  identity: "IDENTITY_DATABASE_URL",
  projects: "PROJECTS_DATABASE_URL",
  calendars: "CALENDARS_DATABASE_URL",
}

const clients = new Map<DatabaseName, Client>()

async function connection(database: DatabaseName = "identity"): Promise<Client> {
  const existing = clients.get(database)
  if (existing) return existing
  const connectionString =
    process.env[ENV_BY_DATABASE[database]] ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      `${ENV_BY_DATABASE[database]} (or DATABASE_URL) is required by the cross-app e2e suite`
    )
  }
  const client = new Client({ connectionString })
  await client.connect()
  clients.set(database, client)
  return client
}

export async function query<T>(
  text: string,
  values: unknown[] = [],
  database: DatabaseName = "identity"
): Promise<T[]> {
  const db = await connection(database)
  const result = await db.query(text, values)
  return result.rows as T[]
}

export async function closeDatabase(): Promise<void> {
  for (const client of clients.values()) await client.end()
  clients.clear()
}

/** Which app database owns one local OIDC session row. */
async function oidcSessionDatabase(id: string): Promise<DatabaseName | null> {
  for (const database of ["projects", "calendars"] as const) {
    const rows = await query<{ id: string }>(
      `select id from "oidcSession" where id = $1`,
      [id],
      database
    )
    if (rows[0]) return database
  }
  return null
}

export interface UserRow {
  id: string
  name: string
  email: string
}

export interface OrganizationRow {
  id: string
  slug: string
  name: string
}

export async function findUserByEmail(email: string): Promise<UserRow> {
  const rows = await query<UserRow>(
    `select id, name, email from "user" where email = $1 limit 1`,
    [email]
  )
  const user = rows[0]
  if (!user) throw new Error(`Unknown user: ${email}`)
  return user
}

export async function findOrganizationBySlug(
  slug: string
): Promise<OrganizationRow & { deletionScheduledAt: string | null }> {
  const rows = await query<
    OrganizationRow & { deletionScheduledAt: string | null }
  >(
    `select id, slug, name, "deletionScheduledAt" from organization where slug = $1 limit 1`,
    [slug]
  )
  const organization = rows[0]
  if (!organization) throw new Error(`Unknown organization: ${slug}`)
  return organization
}

export async function organizationExists(
  organizationId: string
): Promise<boolean> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as count from organization where id = $1`,
    [organizationId]
  )
  return Number(rows[0]?.count ?? 0) > 0
}

export interface OidcSessionRow {
  id: string
  createdAt?: string
  userId: string
  organizationId: string
  sid: string
  accessToken: string
  refreshToken: string | null
  accessTokenExpiresAt: string
}

/**
 * The app-local relying-party sessions for one user.
 *
 * Projects, calendars and files still share the identity database, so the
 * rows are told apart by `sid` (the Copilot sign-in) and by their creation
 * order, not by a table per app.
 */
export async function oidcSessionsForUser(
  userId: string
): Promise<OidcSessionRow[]> {
  const rows = await Promise.all(
    (["projects", "calendars"] as const).map((database) =>
      query<OidcSessionRow>(
        `select id, "userId", "organizationId", sid, "accessToken",
                "refreshToken", "accessTokenExpiresAt", "createdAt"
           from "oidcSession"
          where "userId" = $1`,
        [userId],
        database
      )
    )
  )
  return rows
    .flat()
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

/**
 * Duplicate one app session as a second row.
 *
 * Projects, calendars and files share the identity database, so whichever app
 * authorizes last deletes the other apps' rows for the same Copilot `sid`
 * (`apps/<app>/app/api/auth/callback/route.ts` keeps one local session per
 * sign-in). After the database cutover each app owns its `oidcSession` table
 * and that cleanup only touches its own rows. Duplicating the row with the
 * same `sid` models the other app's table, so the specs assert the
 * revoke-by-sid contract (switch fan-out, back-channel logout) instead of the
 * transitional storage layout.
 */
export async function duplicateAppSession(sourceId: string): Promise<string> {
  const database = await oidcSessionDatabase(sourceId)
  if (!database) throw new Error(`No session row to duplicate: ${sourceId}`)
  const rows = await query<{ id: string }>(
    `insert into "oidcSession"
       (id, "userId", "organizationId", sid, "accessToken", "refreshToken",
        "accessTokenExpiresAt", "createdAt", "updatedAt")
     select 'cross-app-sibling-' || gen_random_uuid(), "userId",
            "organizationId", sid, "accessToken", "refreshToken",
            "accessTokenExpiresAt", now(), now()
       from "oidcSession"
      where id = $1
     returning id`,
    [sourceId],
    database
  )
  const created = rows[0]?.id
  if (!created) throw new Error(`No session row to duplicate: ${sourceId}`)
  return created
}

/** Force the next request to go through the refresh-token grant. */
export async function expireAccessToken(sessionId: string): Promise<void> {
  const database = await oidcSessionDatabase(sessionId)
  if (!database) throw new Error(`No session row: ${sessionId}`)
  await query(
    `update "oidcSession"
        set "accessTokenExpiresAt" = now() - interval '10 minutes'
      where id = $1`,
    [sessionId],
    database
  )
}

/** Make the stored token unusable *and* unrefreshable ("stale token"). */
export async function poisonAccessToken(sessionId: string): Promise<void> {
  const database = await oidcSessionDatabase(sessionId)
  if (!database) throw new Error(`No session row: ${sessionId}`)
  await query(
    `update "oidcSession"
        set "accessTokenExpiresAt" = now() - interval '10 minutes',
            "refreshToken" = null
      where id = $1`,
    [sessionId],
    database
  )
}

export interface CopilotSessionRow {
  id: string
  userId: string
  impersonatedBy: string | null
  createdAt: string
  expiresAt: string
}

export async function copilotSessionForUser(
  userId: string
): Promise<CopilotSessionRow | null> {
  const rows = await query<CopilotSessionRow>(
    `select id, "userId", "impersonatedBy", "createdAt", "expiresAt"
       from session
      where "userId" = $1 and "expiresAt" > now()
      order by "createdAt" desc
      limit 1`,
    [userId]
  )
  return rows[0] ?? null
}

/**
 * The impersonation sessions of one user, oldest first.
 *
 * A target account keeps its own sign-in session, so the specs assert on the
 * sessions the control-tower handoff opened (`impersonatedBy is not null`)
 * rather than on the newest session row.
 */
export async function copilotImpersonationSessions(
  userId: string
): Promise<CopilotSessionRow[]> {
  return query<CopilotSessionRow>(
    `select id, "userId", "impersonatedBy", "createdAt", "expiresAt"
       from session
      where "userId" = $1 and "impersonatedBy" is not null
      order by "createdAt"`,
    [userId]
  )
}

/**
 * Age an impersonation session past its one-hour window without expiring it.
 * The workspace resolver compares `createdAt + 1h` with the current time, so
 * this is the fixture for the TTL gate.
 */
export async function backdateCopilotSession(sessionId: string): Promise<void> {
  await query(
    `update session
        set "createdAt" = now() - interval '61 minutes'
      where id = $1`,
    [sessionId]
  )
}

export async function deleteCopilotSession(sessionId: string): Promise<void> {
  await query(`delete from session where id = $1`, [sessionId])
}

/** Grant a plan without going through billing (the audit fan-out is gated). */
export async function setOrganizationPlan(
  organizationId: string,
  plan: string
): Promise<void> {
  await query(
    `update organization set metadata = json_build_object('plan', $2::text)::text where id = $1`,
    [organizationId, plan]
  )
}

export async function deleteOrganization(
  organizationId: string
): Promise<void> {
  await query(`delete from organization where id = $1`, [organizationId])
}

export interface DeletionJobRow {
  id: string
  status: string
  apps: { app: string; status: string }[]
}

/** The persisted cross-database deletion saga state for an organization. */
export async function deletionJobsForOrganization(
  organizationId: string
): Promise<DeletionJobRow[]> {
  return query<DeletionJobRow>(
    `select j.id,
            j.status,
            coalesce(
              (select json_agg(json_build_object('app', a.app, 'status', a.status))
                 from "organizationDeletionApp" a
                where a."jobId" = j.id),
              '[]'::json
            ) as apps
       from "organizationDeletionJob" j
      where j."organizationId" = $1`,
    [organizationId]
  )
}

export async function scheduleDeletion(organizationId: string): Promise<void> {
  await query(
    `update organization
        set "deletionScheduledAt" = now() - interval '1 minute'
      where id = $1`,
    [organizationId]
  )
}
