import "./load-env"

import pg from "pg"

import { parsePlatformRoles } from "../lib/platform/roles"

/**
 * Maintenance-window cutover for the control-tower database (#209).
 *
 *   npm run cutover:control-tower --workspace=control-tower -- --dry-run
 *   npm run cutover:control-tower --workspace=control-tower -- --apply
 *   npm run cutover:control-tower --workspace=control-tower -- --verify
 *   npm run cutover:control-tower --workspace=control-tower -- --user you@example.com --apply
 *
 * The control tower signs in against `asynchrone_control_tower` (ADR 0032).
 * This script copies only platform operators — users whose `role` contains
 * `platform_admin` or `platform_support` — with their accounts, sessions and
 * TOTP rows, plus the historical platform audit trail and pending handoffs.
 * Customer users, organizations, JWKS and verification tokens are never
 * copied: the control tower reads customer data through Copilot's
 * `/internal/v1/admin/*` API instead.
 *
 * `--user <email>` provisions one operator (for example a new hire who signed
 * up in the customer app) without touching anyone else.
 *
 * It is idempotent: every insert uses `ON CONFLICT (id) DO NOTHING`, so a
 * re-run after the cutover never overwrites a role granted in the control
 * tower and never dups a session. Run it again at the end of the maintenance
 * window to pick up writes made in the source while the apps were frozen.
 *
 * This is the only control-tower code that reads the source database. The app
 * and the `verify:*` scripts use `@workspace/db-control-tower` exclusively.
 */

const TABLES = [
  "user",
  "account",
  "session",
  "twoFactor",
  "platformAuditEvent",
  "platformHandoff",
] as const

type Table = (typeof TABLES)[number]

/** Tables whose rows are scoped to a copied user (`user` itself uses its id). */
const USER_SCOPED: Record<string, string> = {
  user: "id",
  account: "userId",
  session: "userId",
  twoFactor: "userId",
}

interface Options {
  apply: boolean
  verify: boolean
  user: string | null
  reset: boolean
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    apply: false,
    verify: false,
    user: null,
    reset: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] ?? ""
    if (value === "--apply") options.apply = true
    else if (value === "--verify") options.verify = true
    else if (value === "--reset") options.reset = true
    else if (value === "--user") options.user = argv[++index] ?? null
    else if (value.startsWith("--user=")) options.user = value.slice(7)
    else if (value !== "--dry-run") throw new Error(`Unknown flag: ${value}`)
  }
  if (options.apply && options.verify) {
    throw new Error("Pass either --apply or --verify, not both.")
  }
  if (options.reset && !options.apply) {
    throw new Error("--reset deletes rows; combine it with --apply.")
  }
  if (options.reset && options.user) {
    throw new Error(
      "--reset is for a full cutover; it cannot be combined with --user."
    )
  }
  return options
}

function sourceUrl(): string {
  // The platform tables live in the monolith until #185 splits it; point this
  // at the snapshot taken for the maintenance window.
  const url =
    process.env.CONTROL_TOWER_SOURCE_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "CONTROL_TOWER_SOURCE_DATABASE_URL or DATABASE_URL is required"
    )
  }
  return url
}

function targetUrl(): string {
  const url = process.env.CONTROL_TOWER_DATABASE_URL
  if (!url) throw new Error("CONTROL_TOWER_DATABASE_URL is required")
  return url
}

function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

async function columns(client: pg.Client, table: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND is_generated = 'NEVER'
      ORDER BY ordinal_position`,
    [table]
  )
  return result.rows.map((row) => row.column_name)
}

async function exists(client: pg.Client, table: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  )
  return (result.rowCount ?? 0) > 0
}

interface Operator {
  id: string
  email: string
  role: string | null
}

async function operators(
  source: pg.Client,
  user: string | null
): Promise<Operator[]> {
  const result = user
    ? await source.query<Operator>(
        `SELECT id, email, role FROM "user" WHERE lower(email) = lower($1)`,
        [user]
      )
    : await source.query<Operator>(
        `SELECT id, email, role FROM "user" WHERE role LIKE '%platform_%'`
      )
  return result.rows.filter(
    (row) => user ?? parsePlatformRoles(row.role).length > 0
  )
}

async function copyTable(
  source: pg.Client,
  target: pg.Client,
  table: Table,
  sourceColumns: string[],
  targetColumns: string[],
  where: { sql: string; values: unknown[] },
  options: Options
): Promise<number> {
  const shared = sourceColumns.filter((column) =>
    targetColumns.includes(column)
  )
  if (shared.length === 0) throw new Error(`${table}: no shared columns`)

  const rows = await source.query(
    `SELECT ${shared.map(quote).join(", ")} FROM ${quote(table)} ${where.sql}`,
    where.values
  )
  if (rows.rows.length === 0) return 0
  if (!options.apply) return rows.rows.length

  let written = 0
  for (const row of rows.rows as Record<string, unknown>[]) {
    const values = shared.map((column) => row[column])
    const placeholders = shared.map((_, index) => `$${index + 1}`).join(", ")
    const result = await target.query(
      `INSERT INTO ${quote(table)} (${shared.map(quote).join(", ")})
       VALUES (${placeholders})
       ON CONFLICT (id) DO NOTHING`,
      values
    )
    written += result.rowCount ?? 0
  }
  return written
}

function userFilter(
  table: Table,
  ids: string[],
  options: Options
): { sql: string; values: unknown[] } | null {
  const column = USER_SCOPED[table]
  if (!column) {
    // Platform audit events and handoffs are not user rows; a single-operator
    // provisioning run never rewrites the shared platform trail.
    return options.user ? null : { sql: "", values: [] }
  }
  if (options.user)
    return { sql: `WHERE ${quote(column)} = $1`, values: [ids[0]] }
  return { sql: `WHERE ${quote(column)} = ANY($1::text[])`, values: [ids] }
}

async function truncate(target: pg.Client): Promise<void> {
  await target.query(
    `TRUNCATE TABLE ${TABLES.map(quote).join(", ")} RESTART IDENTITY CASCADE`
  )
}

async function verify(
  source: pg.Client,
  target: pg.Client,
  user: string | null
): Promise<void> {
  const expected = await operators(source, user)
  const ids = expected.map((operator) => operator.id)

  const copied = await target.query<{ id: string; role: string | null }>(
    `SELECT id, role FROM "user"`
  )
  const copiedById = new Map(copied.rows.map((row) => [row.id, row]))

  const problems: string[] = []
  for (const operator of expected) {
    if (!copiedById.has(operator.id)) {
      problems.push(`missing operator ${operator.email}`)
    }
  }

  if (!user) {
    for (const row of copied.rows) {
      if (parsePlatformRoles(row.role).length === 0) {
        problems.push(
          `non-platform account in the platform database: ${row.id}`
        )
      }
    }

    for (const table of TABLES) {
      if (!(await exists(source, table))) continue
      const sourceCount = await source.query(
        `SELECT count(*)::int AS count FROM ${quote(table)}${
          USER_SCOPED[table]
            ? ` WHERE ${quote(USER_SCOPED[table])} = ANY($1::text[])`
            : ""
        }`,
        USER_SCOPED[table] ? [ids] : []
      )
      const targetCount = await target.query(
        `SELECT count(*)::int AS count FROM ${quote(table)}`
      )
      const expectedCount = sourceCount.rows[0].count as number
      const actualCount = targetCount.rows[0].count as number
      if (actualCount < expectedCount) {
        problems.push(
          `${table}: expected at least ${expectedCount} rows, found ${actualCount}`
        )
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Control-tower cutover verification failed:\n  ${problems.join("\n  ")}`
    )
  }
  console.log(
    `verified: ${copied.rows.length} platform account${
      copied.rows.length === 1 ? "" : "s"
    } in ${new URL(targetUrl()).pathname.replace(/^\//, "")}`
  )
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (sourceUrl() === targetUrl()) {
    throw new Error(
      "The source and the control-tower database are the same; refusing to copy a database onto itself."
    )
  }
  const source = new pg.Client({ connectionString: sourceUrl() })
  const target = new pg.Client({ connectionString: targetUrl() })
  await source.connect()
  await target.connect()

  try {
    if (options.verify) {
      await verify(source, target, options.user)
      return
    }

    if (options.reset) await truncate(target)

    const people = await operators(source, options.user)
    if (people.length === 0) {
      throw new Error(
        options.user
          ? `No account found for ${options.user} in the source database.`
          : "No platform operator found in the source database."
      )
    }
    const ids = people.map((operator) => operator.id)
    console.log(
      `${options.apply ? "Copying" : "Would copy"} ${people.length} platform account${
        people.length === 1 ? "" : "s"
      }: ${people.map((operator) => operator.email).join(", ")}`
    )

    for (const table of TABLES) {
      if (!(await exists(source, table))) {
        console.log(`  ${table}: source table missing, skipped`)
        continue
      }
      if (!(await exists(target, table))) {
        throw new Error(
          `${table}: target table missing — run npm run migrate:deploy first`
        )
      }
      const sourceColumns = await columns(source, table)
      const targetColumns = await columns(target, table)
      const where = userFilter(table, ids, options)
      if (!where) {
        console.log(`  ${table}: shared platform rows, skipped in --user mode`)
        continue
      }
      const rows = await copyTable(
        source,
        target,
        table,
        sourceColumns,
        targetColumns,
        where,
        options
      )
      console.log(
        `  ${table}: ${rows} ${options.apply ? "written" : "pending"}`
      )
    }

    console.log(
      options.apply
        ? "\nCutover applied. Grant roles if this was a single-operator provisioning run, then run --verify."
        : "\nDry run only. Re-run with --apply inside the maintenance window."
    )
  } finally {
    await source.end()
    await target.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
