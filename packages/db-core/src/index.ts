import { Pool } from "pg"

import { DEFAULT_POOL_MAX, resolvePoolMax } from "./budget"

export {
  APP_CONNECTION_BUDGETS,
  DATABASE_MAX_CONNECTIONS,
  DATABASE_RESERVED_CONNECTIONS,
  DEFAULT_POOL_MAX,
  FLEET_BUDGET_RATIO,
  appPoolCap,
  fleetConnectionBudget,
  resolvePoolMax,
} from "./budget"
export type { AppConnectionBudget, FleetBudget } from "./budget"

/**
 * Shared PostgreSQL pool for the per-app database packages.
 *
 * Each app owns one database and one pool. A per-app package passes its own
 * connection string, its app key and a label; `DATABASE_POOL_MAX` is still the
 * global budget knob, but `createPool` clamps it to the app's ceiling from
 * `budget.ts` so one misconfigured app cannot exhaust the shared PostgreSQL
 * role (ADR 0038).
 *
 * Prisma adapters use the pool with `disposeExternalPool: false` so the
 * large-object helpers and Prisma share one connection set.
 */

/**
 * The raw, un-clamped pool size. Prefer `resolvePoolMax`; this helper exists
 * for backwards compatibility and for callers that size a pool without an app
 * key (scripts, tests).
 */
export function poolMax(
  value = process.env.DATABASE_POOL_MAX,
  fallback = DEFAULT_POOL_MAX
): number {
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed > 0) return parsed
  return fallback
}

export interface CreatePoolOptions {
  /**
   * The app key (`copilot`, `projects`, …). Used to clamp `DATABASE_POOL_MAX`
   * to the app's budget and to label the pool in metrics.
   */
  app?: string
  /** Explicit size, still clamped to the app ceiling. */
  max?: number
  label?: string
}

export function createPool(
  connectionString: string | undefined,
  options: CreatePoolOptions = {}
): Pool {
  if (!connectionString) {
    throw new Error(
      `${options.label ?? "DATABASE_URL"} is required for the database connection`
    )
  }
  const configured = options.max ?? process.env.DATABASE_POOL_MAX
  const max = resolvePoolMax(configured, options.app)
  if (options.app) {
    const requested = Number(configured)
    if (Number.isInteger(requested) && requested > max) {
      console.warn(
        `[db] ${options.app}: DATABASE_POOL_MAX=${requested} exceeds the ${max}-connection budget; clamping (ADR 0038)`
      )
    }
  }
  return new Pool({
    connectionString,
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // A connection left inside a transaction (`idle in transaction`) blocks
    // vacuum and keeps the budget occupied; make PostgreSQL reclaim it.
    idle_in_transaction_session_timeout: 30_000,
    // A large-object download can legitimately stream for minutes; only cap a
    // runaway query far above that.
    statement_timeout: 300_000,
    application_name: options.app ?? options.label ?? "asynchrone-space",
    allowExitOnIdle: true,
  })
}
