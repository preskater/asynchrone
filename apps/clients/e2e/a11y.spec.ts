import { AxeBuilder } from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

import { E2E_CLIENTS_URL } from "./env"
import { openClients, signUp } from "./fixtures"

test("core routes have no serious accessibility violations", async ({
  page,
}) => {
  const account = await signUp(page)
  await openClients(page, account.organizationSlug)

  for (const route of ["clients", "contacts", "deals"]) {
    await page.goto(
      `${E2E_CLIENTS_URL}/en/${account.organizationSlug}/${route}`
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

test("client-side navigation moves focus to the page title", async ({
  page,
}) => {
  const account = await signUp(page)
  await openClients(page, account.organizationSlug)

  await page.getByRole("link", { name: "Contacts" }).first().click()
  await page.waitForURL(`**/${account.organizationSlug}/contacts**`)

  await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
})
