import { expect, test, type Page } from "@playwright/test"

import { prisma as identityPrisma } from "@workspace/db-identity"
import { prisma } from "@workspace/db-clients"

import { E2E_CLIENTS_URL } from "./env"
import { openClients, signUp } from "./fixtures"

/**
 * Workspace authorization on the clients host.
 *
 * The CRM screens and the domain service behind them now answer on
 * `clients.copilot.asynchrone.space`. Client data is organization-scoped: an
 * id from another workspace must be unreachable, even for an internal member
 * of the other organization.
 */

/** Seed a company for an organization (the shared database until #171/#190). */
async function seedClient(
  organizationSlug: string,
  name: string
): Promise<string> {
  const organization = await identityPrisma.organization.findUnique({
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

async function openClient(
  page: Page,
  organizationSlug: string,
  clientId: string
): Promise<void> {
  await page.goto(
    `${E2E_CLIENTS_URL}/en/${organizationSlug}/clients/${clientId}`
  )
}

test("a user cannot read another organization's client", async ({
  browser,
}) => {
  const contextA = await browser.newContext()
  const pageA = await contextA.newPage()
  const accountA = await signUp(pageA)
  await openClients(pageA, accountA.organizationSlug)
  const clientId = await seedClient(
    accountA.organizationSlug,
    "Owner A private company"
  )
  await openClient(pageA, accountA.organizationSlug, clientId)
  await expect(pageA.getByText("Owner A private company").first()).toBeVisible()

  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  const accountB = await signUp(pageB)
  await openClients(pageB, accountB.organizationSlug)

  // B's own organization URL plus A's client id: the lookup is scoped to B's
  // organization and must answer "not found" — never render the name.
  await openClient(pageB, accountB.organizationSlug, clientId)
  // The detail page calls `notFound()` after the organization-scoped lookup
  // fails; `[orgSlug]/not-found.tsx` renders the localized empty state inside
  // the shell and never the other organization's company.
  await expect(pageB.getByText("Page not found", { exact: true })).toBeVisible()
  await expect(
    pageB.getByText("We couldn't find the page you were looking for.", {
      exact: false,
    })
  ).toBeVisible()
  await expect(pageB.getByText("Owner A private company")).toHaveCount(0)

  await contextA.close()
  await contextB.close()
})

test("a member can read the CRM and the company detail page", async ({
  page,
}) => {
  const account = await signUp(page)
  await openClients(page, account.organizationSlug)

  // Members get edit and export rights (rank >= 2) ...
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible()

  const clientId = await seedClient(
    account.organizationSlug,
    "Member readable company"
  )
  await openClient(page, account.organizationSlug, clientId)

  // ... and the detail page renders the company tabs without widening access.
  await expect(page.getByText("Member readable company").first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Deals" }).first()).toBeVisible()
  // Portal invitations stay in Copilot until #171: the card is read-only here.
  await expect(
    page.getByRole("button", { name: "Invite to portal" })
  ).toHaveCount(0)
})
