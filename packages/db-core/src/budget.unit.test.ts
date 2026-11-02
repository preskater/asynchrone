import { describe, expect, it, vi } from "vitest"

import {
  APP_CONNECTION_BUDGETS,
  DATABASE_MAX_CONNECTIONS,
  DATABASE_RESERVED_CONNECTIONS,
  FLEET_BUDGET_RATIO,
  appPoolCap,
  fleetConnectionBudget,
  resolvePoolMax,
} from "./budget"
import { createPool } from "./index"

describe("connection budget", () => {
  it("keeps the fleet below the documented limit at maximum scale", () => {
    const budget = fleetConnectionBudget()
    expect(budget.limit).toBe(
      Math.floor(
        (DATABASE_MAX_CONNECTIONS - DATABASE_RESERVED_CONNECTIONS) *
          FLEET_BUDGET_RATIO
      )
    )
    expect(budget.fits).toBe(true)
    expect(budget.peak).toBeLessThanOrEqual(budget.limit)
    // The steady state is what a default install actually opens.
    expect(budget.steady).toBeLessThan(budget.peak)
    expect(budget.headroom).toBeGreaterThan(0)
  })

  it("accounts for every app exactly once", () => {
    const budget = fleetConnectionBudget()
    expect(budget.perApp.map((app) => app.app).sort()).toEqual(
      Object.keys(APP_CONNECTION_BUDGETS).sort()
    )
  })

  it("gives the stateless landing no database budget", () => {
    expect(appPoolCap("landing")).toBe(0)
    expect(() => resolvePoolMax("3", "landing")).toThrow(
      "landing app has no database connection budget"
    )
  })

  it("clamps a misconfigured pool to the app ceiling", () => {
    expect(resolvePoolMax("50", "copilot")).toBe(
      APP_CONNECTION_BUDGETS.copilot!.poolMax
    )
    expect(resolvePoolMax("1", "files")).toBe(1)
    expect(resolvePoolMax(undefined, "files")).toBe(3)
    expect(resolvePoolMax("not-a-number", "files")).toBe(3)
  })

  it("leaves an unbudgeted app alone", () => {
    expect(resolvePoolMax("12")).toBe(12)
    expect(resolvePoolMax(undefined)).toBe(3)
  })

  it("reports an over-budget chart override", () => {
    const budget = fleetConnectionBudget({
      copilot: { maxReplicas: 40, poolMax: 8, defaultReplicas: 2 },
      files: { maxReplicas: 40, poolMax: 6, defaultReplicas: 2 },
    })
    expect(budget.fits).toBe(false)
    expect(budget.headroom).toBeLessThan(0)
  })
})

describe("createPool budget enforcement", () => {
  it("clamps DATABASE_POOL_MAX to the app ceiling and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const previous = process.env.DATABASE_POOL_MAX
    process.env.DATABASE_POOL_MAX = "99"
    const pool = createPool("postgresql://user:pass@localhost:5432/db", {
      app: "control-tower",
    })
    expect(pool.options.max).toBe(
      APP_CONNECTION_BUDGETS["control-tower"]!.poolMax
    )
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("exceeds the 3-connection budget")
    )
    await pool.end()
    if (previous === undefined) delete process.env.DATABASE_POOL_MAX
    else process.env.DATABASE_POOL_MAX = previous
    warn.mockRestore()
  })

  it("sets application_name and transaction timeouts", async () => {
    const previous = process.env.DATABASE_POOL_MAX
    delete process.env.DATABASE_POOL_MAX
    const pool = createPool("postgresql://user:pass@localhost:5432/db", {
      app: "projects",
    })
    expect(pool.options.max).toBe(3)
    if (previous !== undefined) process.env.DATABASE_POOL_MAX = previous
    expect(pool.options.application_name).toBe("projects")
    expect(pool.options.idle_in_transaction_session_timeout).toBe(30_000)
    await pool.end()
  })
})
