import { expect, test, type Browser, type Page } from "@playwright/test"

import {
  createClient,
  createProject,
  invitePortalClient,
  linkProjectToClient,
  register,
  signUp,
  uniqueEmail,
} from "./fixtures"

/**
 * The client portal lives in Copilot (`/{locale}/portal`, `/api/portal/*`).
 * These tests drive the real invitation flow: an owner links a company and a
 * project, invites a contact, and the contact accepts to become a
 * `role=client` member. A client only ever sees its own company and the
 * projects shared with it, and neither side can cross into the other's routes.
 */

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
  const sharedProjectId = await createProject(slug, sharedProject)
  const privateProject = `Internal ${Date.now()}`
  await createProject(slug, privateProject)

  // The CRM screens moved to `apps/clients` (#163); seed the company, its
  // project link and the invitation through the shared database, then drive
  // only the portal side in the browser.
  const clientName = `Acme ${Date.now()}`
  const clientId = await createClient(slug, clientName)
  await linkProjectToClient(sharedProjectId, clientId)

  // A second company of the same organization must stay invisible: the portal
  // visibility filter runs in the projects app, not in Copilot.
  const otherClientId = await createClient(slug, `Other ${Date.now()}`)
  const otherProject = `Other client ${Date.now()}`
  const otherProjectId = await createProject(slug, otherProject)
  await linkProjectToClient(otherProjectId, otherClientId)

  const email = uniqueEmail()
  const invitationId = await invitePortalClient(page, slug, clientId, email)
  const invitationUrl = `/accept-invitation?id=${encodeURIComponent(invitationId)}`

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
    await expect(
      client.page.getByText(otherProject, { exact: true })
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

    // A client never reaches an internal workspace route, so the portal guard
    // wins over a screen Copilot still owns.
    await client.page.goto(`/${slug}/settings`)
    await expect(client.page).toHaveURL(/\/portal$/)
    await expect(
      client.page.getByRole("link", { name: sharedProject })
    ).toBeVisible()

    // ... nor the internal file API. Since #161 the upload API lives on the
    // files host, so Copilot answers 404 and the files host rejects the
    // request without a workspace session.
    const internalUpload = await client.page.request.post(
      `/api/files/uploads?name=intruder.txt&expectedSize=1`,
      { data: {} }
    )
    expect([403, 404]).toContain(internalUpload.status())
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
