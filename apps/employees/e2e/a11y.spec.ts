import { AxeBuilder } from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

import { E2E_EMPLOYEES_URL } from "./env"
import { openEmployees, signUp } from "./fixtures"

test("core routes have no serious accessibility violations", async ({
  page,
}) => {
  const account = await signUp(page)
  await openEmployees(page, account.organizationSlug)

  for (const route of ["employees"]) {
    await page.goto(
      `${E2E_EMPLOYEES_URL}/en/${account.organizationSlug}/${route}`
    )
    await page.waitForLoadState("networkidle").catch(() => {})

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze()

    const serious = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? "")
    )

    expect(
      serious,
      `a11y on ${route}: ${JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.html)]))}`
    ).toEqual([])
  }
})
