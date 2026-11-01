import { describe, expect, it } from "vitest"

import {
  LEGACY_COPILOT_PATHS,
  WORKSPACE_SECTIONS,
  legacyCopilotTarget,
} from "./workspace"

describe("legacyCopilotTarget", () => {
  it.each([...LEGACY_COPILOT_PATHS])(
    "redirects the top-level /%s path",
    (path) => {
      expect(legacyCopilotTarget(`/${path}`)).toBe(`/${path}`)
    }
  )

  it.each([...LEGACY_COPILOT_PATHS])(
    "keeps the locale prefix for /fr/%s",
    (path) => {
      expect(legacyCopilotTarget(`/fr/${path}`)).toBe(`/fr/${path}`)
    }
  )

  it("preserves the query string for verification and invitation links", () => {
    expect(legacyCopilotTarget("/sign-in", "?redirect=%2Fportal")).toBe(
      "/sign-in?redirect=%2Fportal"
    )
    expect(legacyCopilotTarget("/fr/reset-password", "?token=abc")).toBe(
      "/fr/reset-password?token=abc"
    )
  })

  it("redirects the two-segment assistant API", () => {
    expect(legacyCopilotTarget("/api/assistant")).toBe("/api/assistant")
    expect(legacyCopilotTarget("/fr/api/assistant")).toBe("/fr/api/assistant")
  })

  it("redirects organization-scoped workspace paths with the slug intact", () => {
    for (const section of WORKSPACE_SECTIONS) {
      expect(legacyCopilotTarget(`/acme/${section}`)).toBe(`/acme/${section}`)
      expect(legacyCopilotTarget(`/fr/acme/${section}/detail`)).toBe(
        `/fr/acme/${section}/detail`
      )
    }
  })

  it.each([
    "",
    "/about",
    "/blog",
    "/blog/one-workspace",
    "/careers",
    "/contact",
    "/faq",
    "/features",
    "/legal/privacy",
    "/pricing",
    "/fr/pricing",
  ])("never shadows the marketing path %s", (path) => {
    expect(legacyCopilotTarget(path)).toBeNull()
  })

  it("does not treat a marketing page with a workspace-like child as an org", () => {
    // A future blog post or docs page named `search` stays on the landing.
    expect(legacyCopilotTarget("/blog/search")).toBeNull()
    expect(legacyCopilotTarget("/fr/legal/terms")).toBeNull()
  })

  it("leaves unknown paths, unknown locales and root alone", () => {
    expect(legacyCopilotTarget("/")).toBeNull()
    expect(legacyCopilotTarget("/de/sign-in")).toBeNull()
    expect(legacyCopilotTarget("/unknown")).toBeNull()
    expect(legacyCopilotTarget("/api/other")).toBeNull()
  })
})
