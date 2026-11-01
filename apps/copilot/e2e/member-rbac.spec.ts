import { expect, test } from "@playwright/test"

import { createProject, signUp } from "./fixtures"

/**
 * Workspace RBAC checks. The REST CRUD endpoints these tests used to call were
 * removed in favour of server actions (see ADR 0016), so the same service
 * guards are exercised through the UI.
 */

test("a member cannot remove themselves from the workspace", async ({
  page,
}) => {
  const slug = await signUp(page)

  await page.goto(`/${slug}/projects`)
  const projectId = await createProject(page, "Guarded project")

  // The project settings members tab is the surface that offers removing
  // your own membership; the service must reject it.
  await page.goto(`/${slug}/projects/${projectId}`)
  const removeSelf = page.getByRole("button", { name: "Remove E2E User" })
  await expect(async () => {
    await page.getByRole("tab", { name: "Settings" }).click()
    await expect(removeSelf).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await removeSelf.click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove" })
    .click()

  await expect(
    page.getByText("Your role cannot manage workspace members.")
  ).toBeVisible()

  // Persisted state is unchanged: the member is still part of the workspace.
  await page.reload()
  await expect(async () => {
    await page.getByRole("tab", { name: "Settings" }).click()
    await expect(removeSelf).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
})

test("a user cannot read another organization's project", async ({
  browser,
}) => {
  const contextA = await browser.newContext()
  const pageA = await contextA.newPage()
  const slugA = await signUp(pageA)

  await pageA.goto(`/${slugA}/projects`)
  const projectId = await createProject(pageA, "Owner A private project")

  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  const slugB = await signUp(pageB)

  // B's own workspace URL plus A's project id: the project lookup is scoped
  // to B's organization and must answer "not found" — never render the name.
  await pageB.goto(`/${slugB}/projects/${projectId}`)
  await expect(pageB.getByText("Project not found")).toBeVisible()
  await expect(pageB.getByText("Owner A private project")).not.toBeVisible()

  await contextA.close()
  await contextB.close()
})
