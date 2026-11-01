import { expect, test, type Browser, type Page } from "@playwright/test"

import { createProject, register, signUp, uniqueEmail } from "./fixtures"

/**
 * The client portal lives in Copilot (`/{locale}/portal`, `/api/portal/*`).
 * These tests drive the real invitation flow: an owner links a company and a
 * project, invites a contact, and the contact accepts to become a
 * `role=client` member. A client only ever sees its own company and the
 * projects shared with it, and neither side can cross into the other's routes.
 */

/** Create a client company from the clients page and open its detail page. */
async function createClient(page: Page, slug: string, name: string) {
  await page.goto(`/${slug}/clients`)

  const dialog = page.getByRole("dialog")
  // Retry: a click that lands before hydration is a no-op.
  await expect(async () => {
    await page.getByRole("button", { name: "New company" }).first().click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await dialog.getByLabel("Name", { exact: true }).fill(name)
  await dialog.getByRole("button", { name: "Save", exact: true }).click()

  const link = page.getByRole("link", { name })
  await expect(link).toBeVisible({ timeout: 15_000 })
  await link.click()

  // The client detail page owns the project links and the portal access card.
  await expect(
    page.getByRole("button", { name: "Invite to portal" })
  ).toBeVisible({ timeout: 15_000 })
}

/** Link one existing project to the open client company. */
async function linkProject(page: Page, projectName: string) {
  const dialog = page.getByRole("dialog")
  await expect(async () => {
    await page.getByRole("button", { name: "Link project" }).click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })

  await dialog
    .locator("label", { hasText: projectName })
    .getByRole("checkbox")
    .check()
  await dialog.getByRole("button", { name: "Link 1 project" }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole("link", { name: projectName })).toBeVisible()
}

/** Invite an email to the portal and return the invitation link it shows. */
async function inviteToPortal(page: Page, email: string): Promise<string> {
  const dialog = page.getByRole("dialog")
  await expect(async () => {
    await page.getByRole("button", { name: "Invite to portal" }).click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })

  await dialog.getByLabel("Email", { exact: true }).fill(email)
  await dialog.getByRole("button", { name: "Create invitation" }).click()

  // The dialog replaces the form with the copyable invitation link.
  const linkInput = dialog.locator("#portal-invite-link")
  await expect(linkInput).toHaveValue(/accept-invitation\?id=/)
  return linkInput.inputValue()
}

/** Accept an invitation in a fresh browser context, as the invited contact. */
async function acceptInvitation(
  browser: Browser,
  invitationUrl: string,
  email: string
): Promise<{ page: Page; dispose: () => Promise<void> }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await register(page, email)

  await page.goto(invitationUrl)
  await page.getByRole("button", { name: "Accept" }).click()

  return { page, dispose: () => context.close() }
}

test("a portal client sees its shared project and uploads and downloads documents", async ({
  page,
  browser,
}) => {
  const slug = await signUp(page)

  // Two projects in the workspace: only the linked one reaches the portal.
  const sharedProject = `Shared ${Date.now()}`
  await createProject(slug, sharedProject)
  const privateProject = `Internal ${Date.now()}`
  await createProject(slug, privateProject)

  const clientName = `Acme ${Date.now()}`
  await createClient(page, slug, clientName)
  await linkProject(page, sharedProject)

  const email = uniqueEmail()
  const invitationUrl = await inviteToPortal(page, email)

  // The invited contact accepts and lands in the portal, not the workspace.
  const client = await acceptInvitation(browser, invitationUrl, email)
  try {
    // `next dev` compiles the portal route on first visit.
    await expect(client.page).toHaveURL(/\/portal$/, { timeout: 30_000 })
    await expect(
      client.page.getByRole("heading", { name: /Welcome/ })
    ).toBeVisible({ timeout: 30_000 })
    await expect(client.page.getByText(clientName).first()).toBeVisible()

    // Project visibility: the shared project is linked, the other one is not.
    await expect(
      client.page.getByRole("link", { name: sharedProject })
    ).toBeVisible()
    await expect(
      client.page.getByText(privateProject, { exact: true })
    ).toHaveCount(0)

    // Upload a document from the portal and download the same bytes back.
    const content = `portal document ${Date.now()}`
    const fileName = `brief-${Date.now()}.txt`
    await client.page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from(content),
    })

    const documentLink = client.page.getByRole("link", { name: fileName })
    await expect(documentLink).toBeVisible({ timeout: 30_000 })
    const href = await documentLink.getAttribute("href")
    expect(href).toMatch(/^\/api\/portal\/files\/[^/]+\/download$/)

    const download = await client.page.request.get(href!)
    expect(download.ok()).toBeTruthy()
    expect(await download.text()).toBe(content)

    // A client never reaches an internal workspace route. `/projects` now
    // redirects to the projects host before the portal guard, so use a domain
    // that still lives in Copilot to exercise the guard itself.
    await client.page.goto(`/${slug}/clients`)
    await expect(client.page).toHaveURL(/\/portal$/)
    await expect(
      client.page.getByRole("link", { name: sharedProject })
    ).toBeVisible()

    // ... nor the internal file API, which requires a workspace context.
    const internalUpload = await client.page.request.post(
      `/api/files/uploads?name=intruder.txt&expectedSize=1`,
      { data: {} }
    )
    expect(internalUpload.status()).toBe(403)
  } finally {
    await client.dispose()
  }
})

test("an internal account is redirected out of the portal", async ({
  page,
}) => {
  const slug = await signUp(page)

  await page.goto("/portal")

  // The workspace resolver sends internal members to their organization; the
  // client portal never renders for them.
  await page.waitForURL(new RegExp(`/${slug}`))
  expect(new URL(page.url()).pathname).not.toContain("/portal")
  await expect(
    page.getByRole("link", { name: "Projects" }).first()
  ).toBeVisible({ timeout: 15_000 })

  // The portal API refuses an internal session too.
  const upload = await page.request.post("/api/portal/documents/upload")
  expect(upload.status()).toBe(403)
})
