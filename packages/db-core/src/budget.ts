/**
 * The fleet database-connection budget (ADR 0038, issue #170).
 *
 * Every app instance owns one `pg.Pool`, so the fleet opens
 * `replicas × DATABASE_POOL_MAX` connections per database. Nine apps at two
 * replicas each is already a lot of connections for the one shared PostgreSQL
 * role, and the deployment budget has to survive a horizontal scale-out.
 *
 * This module is the single source of truth for:
 *
 * - the assumed PostgreSQL `max_connections` and the headroom we keep;
 * - the per-app pool ceiling, default replicas and the maximum replicas the
 *   HPA may reach;
 * - the runtime clamp applied to `DATABASE_POOL_MAX` so a misconfigured env
 *   cannot make one app exhaust the shared role.
 *
 * The Helm chart renders the same numbers (`charts/asynchrone-space/values.yaml`
 * `config.DATABASE_POOL_MAX`, `replicaCount` and `autoscaling.maxReplicas`) and
 * `scripts/verify-connection-budget.ts` fails when the two disagree or when the
 * fleet exceeds the budget. Keep them in sync.
 */

export interface AppConnectionBudget {
  /** App key, matching the Helm alias and `APP=<key>` image build arg. */
  readonly app: string
  /** `replicaCount` in the Helm chart. */
  readonly defaultReplicas: number
  /** `autoscaling.maxReplicas`; the budget is sized for this, not the default. */
  readonly maxReplicas: number
  /** Hard ceiling for `DATABASE_POOL_MAX` in this app. */
  readonly poolMax: number
  /** False for an app without a database (the landing). */
  readonly database: boolean
}

/**
 * Assumed server configuration. Raise it only together with the budget below
 * and the `max_connections` setting documented in docs/deployment/database-operations.md.
 */
export const DATABASE_MAX_CONNECTIONS = 200
/** Superuser, monitoring and migration connections kept outside the app budget. */
export const DATABASE_RESERVED_CONNECTIONS = 10
/** We plan for 70% of the usable connections, per the operations guide. */
export const FLEET_BUDGET_RATIO = 0.7

/**
 * Per-app allocation, sized for the target topology (two replicas, HPA up to
 * three or four). The combined "at max scale" figure must stay below
 * `fleetConnectionLimit()`; the verification script enforces that.
 *
 * Why these numbers:
 * - copilot is the identity/OAuth server, the shell and the search/portal
 *   fan-out: the busiest app, so it gets the largest pool and may scale to 4;
 * - files streams PostgreSQL large objects, and every in-flight upload or
 *   download holds a connection, so it gets a slightly larger pool;
 * - the other domain apps are CRUD screens with a small pool;
 * - the control tower is internal and low-traffic but must stay independent.
 */
export const APP_CONNECTION_BUDGETS: Readonly<
  Record<string, AppConnectionBudget>
> = {
  landing: {
    app: "landing",
    defaultReplicas: 2,
    maxReplicas: 2,
    poolMax: 0,
    database: false,
  },
  copilot: {
    app: "copilot",
    defaultReplicas: 2,
    maxReplicas: 4,
    poolMax: 8,
    database: true,
  },
  projects: {
    app: "projects",
    defaultReplicas: 2,
    maxReplicas: 3,
    poolMax: 4,
    database: true,
  },
  calendars: {
    app: "calendars",
    defaultReplicas: 2,
    maxReplicas: 3,
    poolMax: 4,
    database: true,
  },
  files: {
    app: "files",
    defaultReplicas: 2,
    maxReplicas: 3,
    poolMax: 6,
    database: true,
  },
  messages: {
    app: "messages",
    defaultReplicas: 2,
    maxReplicas: 3,
    poolMax: 4,
    database: true,
  },
  clients: {
    app: "clients",
    defaultReplicas: 2,
    maxReplicas: 3,
    poolMax: 4,
    database: true,
  },
  employees: {
    app: "employees",
    defaultReplicas: 2,
    maxReplicas: 3,
    poolMax: 4,
    database: true,
  },
  "control-tower": {
    app: "control-tower",
    defaultReplicas: 2,
    maxReplicas: 2,
    poolMax: 3,
    database: true,
  },
  // The migrate Job runs once per release; it is not an app and never scales.
  migrate: {
    app: "migrate",
    defaultReplicas: 1,
    maxReplicas: 1,
    poolMax: 5,
    database: true,
  },
} as const

/** Default pool size used by `@workspace/db-core` when nothing is configured. */
export const DEFAULT_POOL_MAX = 3

/** The pool ceiling for one app, or `undefined` for an unbudgeted app. */
export function appPoolCap(app: string | undefined): number | undefined {
  if (!app) return undefined
  return APP_CONNECTION_BUDGETS[app]?.poolMax
}

/**
 * The pool size actually used by an app.
 *
 * A valid `DATABASE_POOL_MAX` wins, but never above the app's ceiling: a bad
 * value must not be able to exhaust the shared role. An invalid or missing
 * value falls back to the app ceiling (bounded by `DEFAULT_POOL_MAX`).
 */
export function resolvePoolMax(
  value: string | number | undefined,
  app?: string,
  fallback = DEFAULT_POOL_MAX
): number {
  const cap = appPoolCap(app)
  const parsed = Number(value)
  const configured = Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
  if (cap === undefined) return configured
  if (cap <= 0) {
    throw new Error(`The ${app} app has no database connection budget`)
  }
  return Math.min(configured, cap)
}

export interface FleetBudget {
  /** Usable connections after reserving the admin/monitoring headroom. */
  available: number
  /** 70% of `available`. */
  limit: number
  /** Replicas at their default count times their pool. */
  steady: number
  /** Replicas at `maxReplicas` times their pool. */
  peak: number
  /** `limit - peak`; negative means the fleet does not fit. */
  headroom: number
  fits: boolean
  perApp: { app: string; steady: number; peak: number }[]
}

/**
 * The fleet budget at the default replica count and at maximum scale.
 *
 * `overrides` lets the Helm check pass the rendered values instead of the
 * defaults so a chart-only change cannot silently drift.
 */
export function fleetConnectionBudget(
  overrides: Partial<
    Record<
      string,
      Pick<AppConnectionBudget, "defaultReplicas" | "maxReplicas" | "poolMax">
    >
  > = {}
): FleetBudget {
  const available = DATABASE_MAX_CONNECTIONS - DATABASE_RESERVED_CONNECTIONS
  const limit = Math.floor(available * FLEET_BUDGET_RATIO)
  const perApp = Object.values(APP_CONNECTION_BUDGETS).map((budget) => {
    const override: Partial<
      Pick<AppConnectionBudget, "defaultReplicas" | "maxReplicas" | "poolMax">
    > = overrides[budget.app] ?? {}
    const pool = override.poolMax ?? budget.poolMax
    const steadyReplicas = override.defaultReplicas ?? budget.defaultReplicas
    const peakReplicas = override.maxReplicas ?? budget.maxReplicas
    return {
      app: budget.app,
      steady: steadyReplicas * pool,
      peak: peakReplicas * pool,
    }
  })
  const steady = perApp.reduce((total, app) => total + app.steady, 0)
  const peak = perApp.reduce((total, app) => total + app.peak, 0)
  return {
    available,
    limit,
    steady,
    peak,
    headroom: limit - peak,
    fits: peak <= limit,
    perApp,
  }
}
