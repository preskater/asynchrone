import { expect, test } from "@playwright/test"

import { E2E_COPILOT_URL, E2E_MESSAGES_URL } from "./env"
import {
  createOrganization,
  messagesSessionCookies,
  openMessages,
  seedChannel,
  signUp,
} from "./fixtures"

/**
 * The messages app end to end: sign-in through Copilot, organization switch, a
 * conversation, an attachment round trip and the old Copilot URL redirect.
 */

test("signs in through Copilot and loads messages on its own host", async ({
  page,
  context,
}) => {
  const account = await signUp(page)
  await seedChannel(account)
  await openMessages(page, account.organizationSlug)

  await expect(
    page.getByRole("button", { name: /general/i }).first()
  ).toBeVisible()

  // The session cookie is host-only: set by the messages origin, without a
  // Domain attribute, and never a `.asynchrone.space` cookie.
  const cookies = await messagesSessionCookies(context)
  const session = cookies.find((cookie) =>
    cookie.name.endsWith("asynchrone_session")
  )
  expect(session, "messages session cookie").toBeTruthy()
  expect(session?.domain).toBe("localhost")
  expect(session?.httpOnly).toBe(true)
  expect(cookies.some((cookie) => cookie.name.startsWith("__Host-"))).toBe(
    session?.name.startsWith("__Host-")
  )
})

test("switches organization on the messages host", async ({ page }) => {
  const account = await signUp(page)
  // Creating an organization makes it Copilot's active one, so the first
  // authorization is issued for it; the switcher then goes back to the first.
  const secondSlug = await createOrganization(page, "Second Org")
  await openMessages(page, secondSlug)

  await page.getByRole("button", { name: /Second Org/i }).click()
  await page.getByRole("menuitem", { name: /Message HQ/i }).click()

  // Copilot owns the active organization, so it asks which one the app should
  // access; choosing it sends the browser back into this app's sign-in flow.
  await page.waitForURL(/\/select-organization\?/)
  await page.getByRole("button", { name: /Message HQ/i }).click()

  await page.waitForURL(
    `${E2E_MESSAGES_URL}/en/${account.organizationSlug}/messages**`,
    { timeout: 60_000 }
  )
  await expect(
    page.getByRole("heading", { name: "Messages", level: 1 })
  ).toBeVisible()
})

test("sends a message and round-trips an attachment", async ({ page }) => {
  const account = await signUp(page)
  await seedChannel(account)
  await openMessages(page, account.organizationSlug)

  await page.getByRole("button", { name: /general/i }).click()

  const body = `Hello from the messages app ${Date.now().toString(36)}`
  await page.getByPlaceholder("Type a message").fill(body)
  await page.getByPlaceholder("Type a message").press("Enter")
  await expect(page.getByText(body, { exact: true }).first()).toBeVisible()

  // Attachments keep the files domain's chunked upload semantics: the composer
  // posts a transient session to this host, then the message persists the oid.
  const fileName = `report-${Date.now().toString(36)}.txt`
  const contents = `attachment ${fileName}`
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from(contents),
    })
  await expect(page.getByText(fileName)).toBeVisible({ timeout: 30_000 })

  const attachmentBody = `Here is the report ${Date.now().toString(36)}`
  await page.getByPlaceholder("Type a message").fill(attachmentBody)
  await page.getByPlaceholder("Type a message").press("Enter")

  const link = page.getByRole("link", { name: fileName })
  await expect(link).toBeVisible({ timeout: 30_000 })
  // The composer first renders the optimistic `a_…` attachment id; wait for
  // the persisted row so the download addresses the stored large object.
  await expect(link).toHaveAttribute(
    "href",
    /^\/api\/messages\/attachments\/c[a-z0-9]+$/
  )
  const href = await link.getAttribute("href")

  const download = await page.request.get(`${E2E_MESSAGES_URL}${href}`)
  expect(download.status()).toBe(200)
  expect(await download.text()).toBe(contents)
})

test("a user cannot read another organization's attachment", async ({
  browser,
}) => {
  const contextA = await browser.newContext()
  const pageA = await contextA.newPage()
  const accountA = await signUp(pageA)
  await seedChannel(accountA)
  await openMessages(pageA, accountA.organizationSlug)
  await pageA.getByRole("button", { name: /general/i }).click()

  const fileName = `private-${Date.now().toString(36)}.txt`
  await pageA
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from("private bytes"),
    })
  await expect(pageA.getByText(fileName)).toBeVisible({ timeout: 30_000 })
  await pageA.getByPlaceholder("Type a message").fill("private")
  await pageA.getByPlaceholder("Type a message").press("Enter")
  const linkA = pageA.getByRole("link", { name: fileName })
  await expect(linkA).toBeVisible({ timeout: 30_000 })
  const attachmentPath = (await linkA.getAttribute("href"))!

  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  const accountB = await signUp(pageB)
  await seedChannel(accountB)
  await openMessages(pageB, accountB.organizationSlug)

  // B's own session plus A's attachment id: the lookup is organization-scoped
  // and must answer "not found", never the bytes.
  const response = await pageB.request.get(
    `${E2E_MESSAGES_URL}${attachmentPath}`
  )
  expect(response.status()).toBe(404)

  await contextA.close()
  await contextB.close()
})

test("the old Copilot messages URL redirects to the messages host", async ({
  page,
}) => {
  const response = await page.request.get(
    `${E2E_COPILOT_URL}/en/acme/messages`,
    { maxRedirects: 0 }
  )
  expect(response.status()).toBe(308)
  expect(response.headers()["location"]).toBe(
    `${E2E_MESSAGES_URL}/en/acme/messages`
  )
})
