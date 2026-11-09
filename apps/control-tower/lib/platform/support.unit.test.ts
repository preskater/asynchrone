import { describe, expect, it } from "vitest"

import { STATUS_VARIANT, ticketTarget } from "./support"

describe("ticketTarget", () => {
  it("shows the plan's first-response target for the impact", () => {
    expect(ticketTarget("team", "critical")).toBe("Sev 1 · 4 business h")
    expect(ticketTarget("enterprise", "high")).toBe("Sev 2 · 4 business h")
    expect(ticketTarget("team", "low")).toBe("Sev 3 · 18 business h")
  })

  it("falls back to best effort when the plan has no target", () => {
    expect(ticketTarget("free", "critical")).toBe("Sev 1 · best effort")
    expect(ticketTarget("unknown", "high")).toBe("Sev 2 · best effort")
  })
})

describe("STATUS_VARIANT", () => {
  it("maps every lifecycle status to a badge variant", () => {
    expect(STATUS_VARIANT).toEqual({
      open: "destructive",
      acknowledged: "secondary",
      resolved: "outline",
    })
  })
})
