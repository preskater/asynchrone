import { expect, test, type Page } from "@playwright/test"

import { E2E_PROJECTS_URL } from "./env"
import { openProjects, signUp } from "./fixtures"

/**
 * Workspace authorization on the projects host.
 *
 * Moved from Copilot's `member-rbac.spec.ts` in #160: the project screens and
 * the domain service behind them now answer on `projects.copilot.asynchrone.space`.
 */

/** Create a project from the projects page and return its persisted id. */
async function createProject(page: Page, name: string): Promise<string> {
  const dialog = page.getByRole("dialog")
  await expect(async () => {
    await page.getByRole("button", { name: "Create project" }).first().click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await dialog.getByLabel("Name", { exact: true }).fill(name)
  await dialog.getByRole("button", { name: "Create", exact: true }).click()

  const link = page.getByRole("link", { name })
  await expect(link).toBeVisible({ timeout: 15_000 })
  // The store first shows an optimistic `p_…` id; wait for the persisted cuid.
  await expect(link).toHaveAttribute("href", /\/projects\/c[a-z0-9]+$/)
  const href = await link.getAttribute("href")
  return href!.split("/").pop()!
}

test("a member cannot remove themselves from the workspace", async ({
  page,
}) => {
  const account = await signUp(page)
  await openProjects(page, account.organizationSlug)

  const projectId = await createProject(page, "Guarded project")
  await page.goto(
    `${E2E_PROJECTS_URL}/en/${account.organizationSlug}/projects/${projectId}`
  )

  // The project settings members tab offers removing your own membership; the
  // service must reject it.
  const removeSelf = page.getByRole("button", { name: "Remove Projects E2E" })
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
  const accountA = await signUp(pageA)
  await openProjects(pageA, accountA.organizationSlug)
  const projectId = await createProject(pageA, "Owner A private project")

  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  const accountB = await signUp(pageB)
  await openProjects(pageB, accountB.organizationSlug)

  // B's own organization URL plus A's project id: the lookup is scoped to B's
  // organization and must answer "not found" — never render the name.
  await pageB.goto(
    `${E2E_PROJECTS_URL}/en/${accountB.organizationSlug}/projects/${projectId}`
  )
  await expect(pageB.getByText("Project not found")).toBeVisible()
  await expect(pageB.getByText("Owner A private project")).not.toBeVisible()

  await contextA.close()
  await contextB.close()
})
