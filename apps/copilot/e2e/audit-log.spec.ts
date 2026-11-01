import { expect, test } from "@playwright/test"

import { signUp } from "./fixtures"

/**
 * Settings → Audit log entry point. The full filter/export flow needs an
 * Enterprise workspace, so this checks the gate the pricing page sells: the
 * tab exists for an owner and points at the plan that includes it.
 */
test("an owner sees the audit tab and its Enterprise gate", async ({
  page,
}) => {
  const slug = await signUp(page)

  await page.goto(`/${slug}/settings?tab=audit`)

  await expect(page.getByRole("tab", { name: "Audit log" })).toBeVisible()
  await expect(
    page.getByText(
      "The customer-facing audit log with filters and export is included in the Enterprise plan."
    )
  ).toBeVisible()
  // The free plan has no audit trail, so no table or export button renders.
  await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0)
})
