import { expect, test, type Browser, type Page } from "@playwright/test"

import { E2E_COPILOT_URL, E2E_EMPLOYEES_URL } from "./env"
import { openEmployees, signUp } from "./fixtures"

/**
 * Authorization on the employees host.
 *
 * Salary profiles and payroll are admin-only in `@workspace/employees`
 * (`resolveEmployeeAccess` → `isAdmin` → `requireAdmin`); the app only forwards
 * the OIDC session's membership role. An internal member must not see them, and
 * the token is bound to one organization, so a visit to another workspace is
 * bounced back to the organization the token was issued for.
 */

const COPILOT_ORIGIN = E2E_COPILOT_URL

async function organizationId(page: Page, slug: string): Promise<string> {
  const res = await page.request.get(
    `${E2E_COPILOT_URL}/api/auth/organization/list`,
    { headers: { Origin: COPILOT_ORIGIN } }
  )
  expect(res.ok(), await res.text()).toBeTruthy()
  const organizations = (await res.json()) as { id: string; slug: string }[]
  const organization = organizations.find((entry) => entry.slug === slug)
  if (!organization) throw new Error(`Unknown organization: ${slug}`)
  return organization.id
}

/** Invite an existing account as a plain member and accept as that account. */
async function joinAsMember(
  adminPage: Page,
  browser: Browser,
  organizationId: string,
  email: string
): Promise<void> {
  const invitation = await adminPage.request.post(
    `${E2E_COPILOT_URL}/api/auth/organization/invite-member`,
    {
      headers: { Origin: COPILOT_ORIGIN },
      data: { email, role: "member", organizationId },
    }
  )
  expect(invitation.ok(), await invitation.text()).toBeTruthy()
  const { id } = (await invitation.json()) as { id: string }

  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  const register = await memberPage.request.post(
    `${E2E_COPILOT_URL}/api/auth/sign-up/email`,
    {
      headers: { Origin: COPILOT_ORIGIN },
      data: {
        email,
        password: `employees-e2e-${crypto.randomUUID()}`,
        name: "Employees Member",
      },
    }
  )
  expect(register.ok(), await register.text()).toBeTruthy()

  const accept = await memberPage.request.post(
    `${E2E_COPILOT_URL}/api/auth/organization/accept-invitation`,
    { headers: { Origin: COPILOT_ORIGIN }, data: { invitationId: id } }
  )
  expect(accept.ok(), await accept.text()).toBeTruthy()

  const setActive = await memberPage.request.post(
    `${E2E_COPILOT_URL}/api/auth/organization/set-active`,
    { headers: { Origin: COPILOT_ORIGIN }, data: { organizationId } }
  )
  expect(setActive.ok(), await setActive.text()).toBeTruthy()

  await openEmployees(memberPage, (await organizations(memberPage))[0]!.slug)
  await expect(
    memberPage.getByRole("heading", { name: "Employees", level: 2 })
  ).toBeVisible()

  // The member gets the tracking tabs but never payroll or the salary data.
  await expect(memberPage.getByRole("tab", { name: "Today" })).toBeVisible()
  await expect(memberPage.getByRole("tab", { name: "Payroll" })).toHaveCount(0)

  await memberContext.close()
}

async function organizations(page: Page): Promise<{ slug: string }[]> {
  const res = await page.request.get(
    `${E2E_COPILOT_URL}/api/auth/organization/list`,
    { headers: { Origin: COPILOT_ORIGIN } }
  )
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as { slug: string }[]
}

test("a member cannot read payroll or the salary profiles", async ({
  page,
  browser,
}) => {
  const account = await signUp(page)
  const organization = await organizationId(page, account.organizationSlug)

  await joinAsMember(
    page,
    browser,
    organization,
    `employees_member_${Date.now()}@example.com`
  )
})

test("the access token stays bound to one organization", async ({ page }) => {
  const account = await signUp(page)
  await openEmployees(page, account.organizationSlug)

  // Another organization this account belongs to: visiting its host path must
  // send the browser back to the organization the token was issued for.
  const otherSlug = `other-${Date.now().toString(36)}`
  const created = await page.request.post(
    `${E2E_COPILOT_URL}/api/auth/organization/create`,
    {
      headers: { Origin: COPILOT_ORIGIN },
      data: { name: `Other Org ${otherSlug}`, slug: otherSlug },
    }
  )
  expect(created.ok(), await created.text()).toBeTruthy()

  await page.goto(`${E2E_EMPLOYEES_URL}/en/${otherSlug}/employees`)
  await page.waitForURL(
    `${E2E_EMPLOYEES_URL}/en/${account.organizationSlug}/employees**`,
    { timeout: 60_000 }
  )
  await expect(
    page.getByRole("heading", { name: "Employees", level: 2 })
  ).toBeVisible()
})
