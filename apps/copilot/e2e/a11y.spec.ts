import { AxeBuilder } from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

import { signUp } from "./fixtures"

test("core routes have no serious accessibility violations", async ({
  page,
}) => {
  const slug = await signUp(page)

  // Projects (#160), calendars/files (#161) and messages (#162) moved to their
  // own hosts; the Copilot shell no longer renders them (the old paths
  // 308-redirect) and their own suites cover accessibility.
  const routes = [`/${slug}`, `/${slug}/search`, `/${slug}/settings`]

  for (const route of routes) {
    await page.goto(route)
    await page.waitForLoadState("networkidle").catch(() => {})

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze()

    const serious = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? "")
    )

    expect(
      serious,
      `a11y on ${route}: ${JSON.stringify(serious.map((v) => v.id))}`
    ).toEqual([])
  }
})
