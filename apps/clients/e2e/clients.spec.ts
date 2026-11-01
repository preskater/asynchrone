import { expect, test, type Page } from "@playwright/test"

import { prisma } from "@workspace/db"

import { E2E_CLIENTS_URL } from "./env"
import {
  clientsSessionCookies,
  createOrganization,
  openClients,
  signUp,
} from "./fixtures"

/**
 * The clients app end to end: sign-in through Copilot, organization switch and
 * a company flow, all on `clients.copilot.asynchrone.space` (here
 * localhost:3008) with no in-process Copilot session.
 */

async function seedClient(
  organizationSlug: string,
  name: string
): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true },
  })
  if (!organization)
    throw new Error(`Unknown organization: ${organizationSlug}`)

  const client = await prisma.client.create({
    data: { organizationId: organization.id, name, status: "active" },
    select: { id: true },
  })
  return client.id
}

test("signs in through Copilot and loads the CRM on its own host", async ({
  page,
  context,
}) => {
  const account = await signUp(page)

  await openClients(page, account.organizationSlug)

  await expect(
    page.getByRole("heading", { name: "Clients", level: 2 })
  ).toBeVisible()

  // The session cookie is host-only: set by the clients origin, without a
  // Domain attribute, and never a `.asynchrone.space` cookie.
  const cookies = await clientsSessionCookies(context)
  const session = cookies.find((cookie) =>
    cookie.name.endsWith("asynchrone_session")
  )
  expect(session, "clients session cookie").toBeTruthy()
  expect(session?.domain).toBe("localhost")
  expect(session?.httpOnly).toBe(true)
  expect(cookies.some((cookie) => cookie.name.startsWith("__Host-"))).toBe(
    session?.name.startsWith("__Host-")
  )
})

test("switches organization on the clients host", async ({ page }) => {
  const account = await signUp(page)
  // Creating an organization makes it Copilot's active one, so the first
  // authorization is issued for it; the switcher then goes back to the first.
  const secondSlug = await createOrganization(page, "Second Org")
  await openClients(page, secondSlug)

  await page.getByRole("button", { name: /Second Org/i }).click()
  await page.getByRole("menuitem", { name: /Client HQ/i }).click()

  // Copilot owns the active organization, so it asks which one the app should
  // access; choosing it sends the browser back into this app's sign-in flow.
  await page.waitForURL(/\/select-organization\?/)
  await page.getByRole("button", { name: /Client HQ/i }).click()

  await page.waitForURL(
    `${E2E_CLIENTS_URL}/en/${account.organizationSlug}/clients**`,
    { timeout: 60_000 }
  )
  await expect(
    page.getByRole("heading", { name: "Clients", level: 2 })
  ).toBeVisible()
})

test("opens a company and its detail page", async ({ page }) => {
  const account = await signUp(page)
  await openClients(page, account.organizationSlug)

  const clientName = `E2E Company ${Date.now().toString(36)}`
  const clientId = await seedClient(account.organizationSlug, clientName)
  await page.reload()

  const link = page.getByRole("link", { name: clientName })
  await expect(link).toBeVisible({ timeout: 15_000 })
  await link.click()

  await page.waitForURL(
    `${E2E_CLIENTS_URL}/en/${account.organizationSlug}/clients/${clientId}`
  )
  await expect(page.getByText(clientName).first()).toBeVisible()
  // The contacts/deals tabs belong to the same app and stay reachable.
  await expect(page.getByRole("link", { name: "Deals" }).first()).toBeVisible()
})

test("the new-company form opens on the clients host", async ({ page }) => {
  const account = await signUp(page)
  await openClients(page, account.organizationSlug)

  // Retry the open: a click that lands before hydration is a no-op.
  const dialog = page.getByRole("dialog")
  await expect(async () => {
    await page.getByRole("button", { name: "New company" }).click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })

  const name = dialog.getByLabel("Name", { exact: true })
  await expect(name).toBeVisible()
  // The submit stays disabled until the company has a name.
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled()
  await name.fill("Form check")
  await expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled()
})
