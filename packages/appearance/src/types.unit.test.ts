import { describe, expect, it } from "vitest"

import {
  appearanceAttributes,
  DEFAULT_APPEARANCE,
  normalizeOrganizationAppearance,
  parseOrganizationAppearance,
  parseOrganizationMetadata,
  readableForeground,
} from "./types"

describe("appearance types", () => {
  it("falls back to the defaults when metadata is missing", () => {
    expect(parseOrganizationAppearance(null)).toEqual(DEFAULT_APPEARANCE)
    expect(parseOrganizationAppearance("not json")).toEqual(DEFAULT_APPEARANCE)
  })

  it("keeps valid values and repairs invalid ones", () => {
    const appearance = normalizeOrganizationAppearance({
      theme: "cyberpunk",
      custom: { primary: "#7c3aed", accent: "nope", radius: 8 },
      animations: {
        level: "fantastic",
        effects: { hoverLift: false, priorityFire: "yes" },
      },
    })

    expect(appearance.theme).toBe("cyberpunk")
    expect(appearance.custom.primary).toBe("#7c3aed")
    expect(appearance.custom.accent).toBe(DEFAULT_APPEARANCE.custom.accent)
    expect(appearance.custom.radius).toBe(2)
    expect(appearance.animations.level).toBe("fantastic")
    expect(appearance.animations.effects.hoverLift).toBe(false)
    expect(appearance.animations.effects.priorityFire).toBe(
      DEFAULT_APPEARANCE.animations.effects.priorityFire
    )
    expect(appearance.animations.effects.hoverGlow).toBe(
      DEFAULT_APPEARANCE.animations.effects.hoverGlow
    )
  })

  it("reads appearance without losing sibling metadata keys", () => {
    const metadata = JSON.stringify({
      plan: "team",
      appearance: { theme: "ocean", animations: { level: "basic" } },
    })

    expect(parseOrganizationMetadata(metadata).plan).toBe("team")
    expect(parseOrganizationAppearance(metadata).theme).toBe("ocean")
    expect(parseOrganizationAppearance(metadata).animations.level).toBe("basic")
  })

  it("maps effects to DOM attributes", () => {
    const attributes = appearanceAttributes(DEFAULT_APPEARANCE, {
      highContrast: true,
      disableAnimations: true,
    })

    expect(attributes["data-org-theme"]).toBe("default")
    expect(attributes["data-motion-level"]).toBe("fluid")
    expect(attributes["data-motion"]).toBe("off")
    expect(attributes["data-contrast"]).toBe("high")
    expect(attributes["data-fx-lift"]).toBe(
      DEFAULT_APPEARANCE.animations.effects.hoverLift ? "on" : "off"
    )
  })

  it("chooses a readable foreground for custom colors", () => {
    expect(readableForeground("#000000")).toBe("#ffffff")
    expect(readableForeground("#ffffff")).toBe("#0a0a0a")
    expect(readableForeground("#facc15")).toBe("#0a0a0a")
    expect(readableForeground("#7c3aed")).toBe("#ffffff")
  })
})
