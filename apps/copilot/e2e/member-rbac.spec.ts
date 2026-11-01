import { expect, test, type Page } from "@playwright/test"

import { signUp } from "./fixtures"

/**
 * Workspace RBAC checks. The REST CRUD endpoints these tests used to call were
 * removed in favour of server actions (see ADR 0016), so the same service
 * guards are exercised through the UI.
 */

/** Create a project from the projects page and return its persisted id. */
async function createProject(page: Page, name: string): Promise<string> {
  const dialog = page.getByRole("dialog")
  // Retry the click: a click that lands before hydration is a no-op.
  await expect(async () => {
    await page.getByRole("button", { name: "Create project" }).first().click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await dialog.getByLabel("Name", { exact: true }).fill(name)
  await dialog.getByRole("button", { name: "Create", exact: true }).click()

  const link = page.getByRole("link", { name })
  await expect(link).toBeVisible({ timeout: 15_000 })
  // The store first shows an optimistic `p_…` id; wait for the persisted
  // cuid to land before reading the link.
  await expect(link).toHaveAttribute("href", /\/projects\/c[a-z0-9]+$/)
  const href = await link.getAttribute("href")
  return href!.split("/").pop()!
}

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
