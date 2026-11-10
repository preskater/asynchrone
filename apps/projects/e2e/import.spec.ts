import { expect, test } from "@playwright/test"

import { E2E_PROJECTS_URL } from "./env"
import { openProjects, signUp } from "./fixtures"

/** Bulk import from a file (#131): preview, write, then a safe re-run. */
test("imports tasks from a CSV without duplicates", async ({ page }) => {
  const account = await signUp(page)
  await openProjects(page, account.organizationSlug)

  const projectName = `Import ${Date.now().toString(36)}`
  await page.getByRole("button", { name: "Create project" }).first().click()
  await page.locator("#project-name").fill(projectName)
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click()
  // The card is optimistic until the action resolves: wait for the real id.
  const projectLink = page.getByRole("link", { name: new RegExp(projectName) })
  await expect(projectLink).toHaveAttribute("href", /\/projects\/(?!p_)\w+/)
  await projectLink.click()
  await page.waitForURL(
    `${E2E_PROJECTS_URL}/en/${account.organizationSlug}/projects/**`
  )

  const csv = [
    "Summary,Description,Status,Priority,Assignee,Due date",
    `Imported one,"line 1\nline 2",In Progress,High,${account.email},2030-01-15`,
    "Imported two,,Blocked,,nobody@example.com,01/02/2030",
    ",orphan description,,,,",
  ].join("\n")

  const openDialog = async () => {
    await page.getByRole("button", { name: "Project actions" }).click()
    await page.getByRole("menuitem", { name: "Import tasks" }).click()
    await page.getByLabel("File").setInputFiles({
      name: "jira.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    })
  }

  await openDialog()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("3 rows detected.")).toBeVisible()

  await dialog.getByRole("button", { name: "Preview import" }).click()
  await expect(dialog.getByText("2 to create")).toBeVisible()
  await expect(dialog.getByText("1 left out")).toBeVisible()
  await expect(dialog.getByText(/Unknown status "Blocked"/)).toBeVisible()
  await expect(
    dialog.getByText(/this email "nobody@example\.com"/)
  ).toBeVisible()
  await expect(dialog.getByText(/"01\/02\/2030"/)).toBeVisible()

  await dialog.getByRole("button", { name: "Import 2 tasks" }).click()
  await expect(dialog.getByText("2 created")).toBeVisible()

  await page.keyboard.press("Escape")
  await page.getByRole("tab", { name: "List" }).click()
  await expect(page.getByText("Imported one").first()).toBeVisible()
  await expect(page.getByText("Imported two").first()).toBeVisible()

  await openDialog()
  await dialog.getByRole("button", { name: "Preview import" }).click()
  await expect(dialog.getByText("0 to create")).toBeVisible()
  await expect(dialog.getByText("2 duplicates skipped")).toBeVisible()
  await expect(dialog.getByRole("button", { name: /^Import \d/ })).toHaveCount(
    0
  )
})
