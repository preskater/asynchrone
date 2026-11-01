import { expect, test } from "@playwright/test"

import { E2E_PROJECTS_URL } from "./env"
import {
  createOrganization,
  openProjects,
  projectsSessionCookies,
  signUp,
} from "./fixtures"

/**
 * The projects app end to end: sign-in through Copilot, organization switch and
 * a project/task flow, all on `projects.copilot.asynchrone.space` (here
 * localhost:3004) with no in-process Copilot session.
 */

test("signs in through Copilot and loads projects on its own host", async ({
  page,
  context,
}) => {
  const account = await signUp(page)

  await openProjects(page, account.organizationSlug)

  // The projects host rendered its own screen.
  await expect(
    page.getByRole("heading", { name: "Projects", level: 2 })
  ).toBeVisible()

  // The session cookie is host-only: set by the projects origin, without a
  // Domain attribute, and never a `.asynchrone.space` cookie.
  const cookies = await projectsSessionCookies(context)
  const session = cookies.find((cookie) =>
    cookie.name.endsWith("asynchrone_session")
  )
  expect(session, "projects session cookie").toBeTruthy()
  expect(session?.domain).toBe("localhost")
  expect(session?.httpOnly).toBe(true)
  expect(cookies.some((cookie) => cookie.name.startsWith("__Host-"))).toBe(
    session?.name.startsWith("__Host-")
  )
})

test("switches organization on the projects host", async ({ page }) => {
  const account = await signUp(page)
  // Creating an organization makes it Copilot's active one, so the first
  // authorization is issued for it; the switcher then goes back to the first.
  const secondSlug = await createOrganization(page, "Second Org")
  await openProjects(page, secondSlug)

  // The switcher hands off to Copilot (it owns the session's active
  // organization), then re-authorizes here for the chosen organization.
  await page.getByRole("button", { name: /Second Org/i }).click()
  await page.getByRole("menuitem", { name: /Project HQ/i }).click()

  // Copilot owns the active organization, so it asks which one the app should
  // access; choosing it sends the browser back into this app's sign-in flow.
  await page.waitForURL(/\/select-organization\?/)
  await page.getByRole("button", { name: /Project HQ/i }).click()

  await page.waitForURL(
    `${E2E_PROJECTS_URL}/en/${account.organizationSlug}/projects**`,
    { timeout: 60_000 }
  )
  await expect(
    page.getByRole("heading", { name: "Projects", level: 2 })
  ).toBeVisible()
})

test("creates a project and a task", async ({ page }) => {
  const account = await signUp(page)
  await openProjects(page, account.organizationSlug)

  const projectName = `E2E Project ${Date.now().toString(36)}`

  await page.getByRole("button", { name: "Create project" }).first().click()
  await page.locator("#project-name").fill(projectName)
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click()

  // The card is optimistic until the action resolves; wait for the server row
  // so the link carries the real project id.
  await expect(page.getByText(/Project .* created/)).toBeVisible()
  const projectLink = page.getByRole("link", { name: new RegExp(projectName) })
  await expect(projectLink).toBeVisible()
  await expect(projectLink).toHaveAttribute("href", /\/projects\/(?!p_)\w+/)
  await projectLink.click()
  await page.waitForURL(
    `${E2E_PROJECTS_URL}/en/${account.organizationSlug}/projects/**`
  )

  const taskTitle = `E2E Task ${Date.now().toString(36)}`
  // A project without templates opens the blank form straight away; with
  // templates the first step is the template chooser.
  await page.getByRole("button", { name: "Create task" }).click()
  const taskDialog = page.getByRole("dialog")
  const quickTask = taskDialog.getByText("Quick task")
  if (await quickTask.count()) await quickTask.click()
  await taskDialog.getByLabel("Title").fill(taskTitle)
  await taskDialog.getByRole("button", { name: "Create task" }).click()

  await expect(page.getByText(/Task .* created/)).toBeVisible()
  await page.getByRole("tab", { name: "List" }).click()
  await expect(page.getByText(taskTitle)).toBeVisible()
})
