#!/usr/bin/env node
/**
 * Fleet connection-budget check (ADR 0038, issue #170).
 *
 * Reads the documented budget from `packages/db-core/src/budget.ts` and the
 * rendered topology from `charts/asynchrone-space/values.yaml`, then fails when
 * any of the following is true:
 *
 * - an app's `config.DATABASE_POOL_MAX` differs from its db-core ceiling;
 * - an app's replica defaults differ from the documented topology;
 * - the fleet at maximum scale (replicas × pool, plus the migrate Job) exceeds
 *   70% of `max_connections - reserved`.
 *
 * This is the drift guard: the chart values, the runtime clamp and the docs
 * must agree. Run it with `npm run verify:connection-budget`.
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  APP_CONNECTION_BUDGETS,
  DATABASE_MAX_CONNECTIONS,
  DATABASE_RESERVED_CONNECTIONS,
  FLEET_BUDGET_RATIO,
  fleetConnectionBudget,
} from "../packages/db-core/src/budget.ts"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const VALUES = join(ROOT, "charts/asynchrone-space/values.yaml")

const errors = []
function check(condition, message) {
  if (!condition) errors.push(message)
}

function unquote(value) {
  return String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
}

/**
 * Minimal indentation-aware reader for the app blocks of the umbrella values.
 * The file is hand-written YAML with one top-level key per app, so a full YAML
 * parser (and a new dependency) is unnecessary.
 */
function readChartTopology(source) {
  const apps = {}
  let app = null
  let section = null
  let sectionIndent = -1
  for (const raw of source.split("\n")) {
    const line = raw.replace(/\t/g, "  ")
    const topLevel = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*$/)
    if (topLevel) {
      app = topLevel[1]
      section = null
      continue
    }
    if (!app) continue
    const indent = line.length - line.trimStart().length
    const entry = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
    if (!entry) continue
    const [, spaces, key, value] = entry
    const level = spaces.length
    if (!value) {
      if (level === 2) {
        section = key
        sectionIndent = level
      } else if (level > sectionIndent) {
        section = section
      }
      continue
    }
    if (level === 2 && key === "enabled") {
      apps[app] ??= {}
      apps[app].enabled = unquote(value) === "true"
    } else if (level === 2 && key === "replicaCount") {
      apps[app] ??= {}
      apps[app].replicaCount = Number(unquote(value))
    } else if (level === 2 && key === "config") {
      section = "config"
      sectionIndent = level
    } else if (level === 2 && key === "autoscaling") {
      section = "autoscaling"
      sectionIndent = level
    } else if (
      level === 4 &&
      section === "config" &&
      key === "DATABASE_POOL_MAX"
    ) {
      apps[app] ??= {}
      apps[app].poolMax = Number(unquote(value))
    } else if (
      level === 4 &&
      section === "autoscaling" &&
      key === "maxReplicas"
    ) {
      apps[app] ??= {}
      apps[app].maxReplicas = Number(unquote(value))
    }
  }
  return apps
}

function readConnectionBudget(source) {
  const block = source.split("\nconnectionBudget:\n")[1]
  if (!block) return null
  const result = {}
  let inAppPoolMax = false
  for (const raw of block.split("\n")) {
    if (/^[A-Za-z]/.test(raw)) break // next top-level key
    const line = raw.trim()
    if (line.endsWith("appPoolMax:")) {
      inAppPoolMax = true
      continue
    }
    const entry = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.+)$/)
    if (!entry) continue
    if (inAppPoolMax && /^\s{4}/.test(raw)) {
      result.appPoolMax ??= {}
      result.appPoolMax[entry[1]] = Number(unquote(entry[2]))
    } else if (/^\s{2}/.test(raw) && !/^\s{4}/.test(raw)) {
      result[entry[1]] = Number(unquote(entry[2]))
      inAppPoolMax = false
    }
  }
  return result
}

const source = readFileSync(VALUES, "utf8")
const chart = readChartTopology(source)
const budget = readConnectionBudget(source)

check(Boolean(budget), "values.yaml has a connectionBudget block")
if (budget) {
  check(
    budget.maxConnections === DATABASE_MAX_CONNECTIONS,
    `connectionBudget.maxConnections=${budget.maxConnections} must match db-core (${DATABASE_MAX_CONNECTIONS})`
  )
  check(
    budget.reservedConnections === DATABASE_RESERVED_CONNECTIONS,
    `connectionBudget.reservedConnections=${budget.reservedConnections} must match db-core (${DATABASE_RESERVED_CONNECTIONS})`
  )
  check(
    budget.ratioPercent === Math.round(FLEET_BUDGET_RATIO * 100),
    `connectionBudget.ratioPercent=${budget.ratioPercent} must match db-core (${FLEET_BUDGET_RATIO * 100})`
  )
}

const overrides = {}
for (const [key, documented] of Object.entries(APP_CONNECTION_BUDGETS)) {
  if (key === "landing") continue
  if (key === "migrate") {
    // The migrate Job is a release hook, not an app block in values.yaml; its
    // pool ceiling comes from connectionBudget.appPoolMax.migrate.
    const pool = budget?.appPoolMax?.migrate ?? documented.poolMax
    check(
      pool === documented.poolMax,
      `connectionBudget.appPoolMax.migrate=${pool} must match the db-core ceiling ${documented.poolMax}`
    )
    check(
      chart.migrate?.enabled !== false,
      "migrate.enabled=false is not budgeted for; keep the hook enabled"
    )
    overrides[key] = {
      defaultReplicas: 1,
      maxReplicas: 1,
      poolMax: pool,
    }
    continue
  }
  const values = chart[key]
  check(Boolean(values), `values.yaml has an app block for ${key}`)
  if (!values) continue
  check(
    values.replicaCount === documented.defaultReplicas,
    `${key}.replicaCount=${values.replicaCount} must match the documented ${documented.defaultReplicas}`
  )
  if (documented.database) {
    check(
      values.poolMax === documented.poolMax,
      `${key}.config.DATABASE_POOL_MAX=${values.poolMax} must match the db-core ceiling ${documented.poolMax}`
    )
    check(
      values.maxReplicas === documented.maxReplicas,
      `${key}.autoscaling.maxReplicas=${values.maxReplicas} must match the documented ${documented.maxReplicas}`
    )
    if (budget?.appPoolMax) {
      check(
        budget.appPoolMax[key] === documented.poolMax,
        `connectionBudget.appPoolMax.${key}=${budget.appPoolMax[key]} must match the db-core ceiling ${documented.poolMax}`
      )
    }
  }
  overrides[key] = {
    defaultReplicas: values.replicaCount ?? documented.defaultReplicas,
    maxReplicas: Math.max(
      values.maxReplicas ?? documented.maxReplicas,
      values.replicaCount ?? documented.defaultReplicas
    ),
    poolMax: documented.database ? (values.poolMax ?? documented.poolMax) : 0,
  }
}

const fleet = fleetConnectionBudget(overrides)
check(
  fleet.fits,
  `the fleet would open ${fleet.peak} connections at maximum scale, above the ${fleet.limit}-connection budget`
)
check(
  fleet.steady <= fleet.limit,
  `the fleet steady state (${fleet.steady}) is above the ${fleet.limit}-connection budget`
)

if (errors.length > 0) {
  console.error(`Connection budget check failed (${errors.length}):`)
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

const rows = fleet.perApp
  .filter((app) => app.peak > 0)
  .map(
    (app) =>
      `  ${app.app.padEnd(15)} steady ${String(app.steady).padStart(3)}  peak ${String(app.peak).padStart(3)}`
  )
console.log("Connection budget")
console.log(
  `  PostgreSQL max_connections ${DATABASE_MAX_CONNECTIONS}, reserved ${DATABASE_RESERVED_CONNECTIONS}, plan ${Math.round(FLEET_BUDGET_RATIO * 100)}% -> ${fleet.limit} usable`
)
console.log(rows.join("\n"))
console.log(
  `  total: steady ${fleet.steady}, peak ${fleet.peak}, headroom ${fleet.headroom} (fits)`
)
console.log("\nConnection budget check passed.")
