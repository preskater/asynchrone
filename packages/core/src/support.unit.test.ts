import { describe, expect, it } from "vitest"

import { responseTargetHours, severityForImpact } from "./support"

describe("support policy", () => {
  it("maps the form impact to a severity", () => {
    expect(severityForImpact("critical")).toBe("sev1")
    expect(severityForImpact("high")).toBe("sev2")
    expect(severityForImpact("medium")).toBe("sev3")
    expect(severityForImpact("low")).toBe("sev3")
  })

  it("resolves the first-response target per plan", () => {
    expect(responseTargetHours("enterprise", "critical")).toBe(2)
    expect(responseTargetHours("team", "low")).toBe(18)
    expect(responseTargetHours("free", "critical")).toBeNull()
    expect(responseTargetHours("unknown", "critical")).toBeNull()
  })
})
