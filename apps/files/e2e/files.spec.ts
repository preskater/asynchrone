import { expect, test } from "@playwright/test"

import { E2E_FILES_URL } from "./env"
import {
  createOrganization,
  filesSessionCookies,
  openFiles,
  signUp,
} from "./fixtures"

/**
 * The files app end to end: sign-in through Copilot, organization switch and a
 * file upload/download, all on `files.copilot.asynchrone.space` (here
 * localhost:3006) with no in-process Copilot session.
 */

test("signs in through Copilot and loads files on its own host", async ({
  page,
  context,
}) => {
  const account = await signUp(page)

  await openFiles(page, account.organizationSlug)

  // The files host rendered its own screen.
  await expect(
    page.getByRole("heading", { name: "Files", level: 2 })
  ).toBeVisible()

  // The session cookie is host-only: set by the files origin, without a
  // Domain attribute, and never a `.asynchrone.space` cookie.
  const cookies = await filesSessionCookies(context)
  const session = cookies.find((cookie) =>
    cookie.name.endsWith("asynchrone_session")
  )
  expect(session, "files session cookie").toBeTruthy()
  expect(session?.domain).toBe("localhost")
  expect(session?.httpOnly).toBe(true)
  expect(cookies.some((cookie) => cookie.name.startsWith("__Host-"))).toBe(
    session?.name.startsWith("__Host-")
  )
})

test("switches organization on the files host", async ({ page }) => {
  const account = await signUp(page)
  // Creating an organization makes it Copilot's active one, so the first
  // authorization is issued for it; the switcher then goes back to the first.
  const secondSlug = await createOrganization(page, "Second Org")
  await openFiles(page, secondSlug)

  // The switcher hands off to Copilot (it owns the session's active
  // organization), then re-authorizes here for the chosen organization.
  await page.getByRole("button", { name: /Second Org/i }).click()
  await page.getByRole("menuitem", { name: /Files HQ/i }).click()

  // Copilot owns the active organization, so it asks which one the app should
  // access; choosing it sends the browser back into this app's sign-in flow.
  await page.waitForURL(/\/select-organization\?/)
  await page.getByRole("button", { name: /Files HQ/i }).click()

  await page.waitForURL(
    `${E2E_FILES_URL}/en/${account.organizationSlug}/files**`,
    { timeout: 60_000 }
  )
  await expect(
    page.getByRole("heading", { name: "Files", level: 2 })
  ).toBeVisible()
})

test("uploads a file and downloads it again", async ({ page }) => {
  const account = await signUp(page)
  await openFiles(page, account.organizationSlug)

  const name = `e2e-${Date.now().toString(36)}.txt`
  const content = `files app split ${name}`

  // Open the upload dialog and hand the hidden input a real file; the dialog
  // then drives the chunked upload API.
  await page.getByRole("button", { name: "Upload", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(content, "utf8"),
  })
  await dialog.getByRole("button", { name: "Upload (1)" }).click()

  // The upload session completes and the file appears in the list.
  const row = page.getByRole("row", { name: new RegExp(name) })
  await expect(row).toBeVisible({ timeout: 60_000 })

  // Download goes through this app's API and streams the large object back.
  await row.getByRole("button", { name: "File actions" }).click()
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 })
  await page.getByRole("menuitem", { name: "Download" }).click()
  const download = await downloadPromise

  const path = await download.path()
  expect(path).toBeTruthy()
  const { readFile } = await import("node:fs/promises")
  expect(await readFile(path!, "utf8")).toBe(content)
})
