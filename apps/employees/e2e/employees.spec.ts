import { expect, test } from "@playwright/test"

import { E2E_EMPLOYEES_URL } from "./env"
import {
  createOrganization,
  employeesSessionCookies,
  openEmployees,
  signUp,
} from "./fixtures"

/**
 * The employees app end to end: sign-in through Copilot, organization switch
 * and the time & attendance workspace, all on
 * `employees.copilot.asynchrone.space` (here localhost:3009).
 */

test("signs in through Copilot and loads the workspace on its own host", async ({
  page,
  context,
}) => {
  const account = await signUp(page)

  await openEmployees(page, account.organizationSlug)

  await expect(
    page.getByRole("heading", { name: "Time & attendance", level: 2 })
  ).toBeVisible()
  await expect(page.getByRole("tab", { name: "Today" })).toBeVisible()

  // The session cookie is host-only: set by the employees origin, without a
  // Domain attribute, and never a `.asynchrone.space` cookie.
  const cookies = await employeesSessionCookies(context)
  const session = cookies.find((cookie) =>
    cookie.name.endsWith("asynchrone_session")
  )
  expect(session, "employees session cookie").toBeTruthy()
  expect(session?.domain).toBe("localhost")
  expect(session?.httpOnly).toBe(true)
  expect(cookies.some((cookie) => cookie.name.startsWith("__Host-"))).toBe(
    session?.name.startsWith("__Host-")
  )
})

test("switches organization on the employees host", async ({ page }) => {
  const account = await signUp(page)
  const secondSlug = await createOrganization(page, "Second Org")
  await openEmployees(page, secondSlug)

  await page.getByRole("button", { name: /Second Org/i }).click()
  await page.getByRole("menuitem", { name: /Employee HQ/i }).click()

  await page.waitForURL(/\/select-organization\?/)
  await page.getByRole("button", { name: /Employee HQ/i }).click()

  await page.waitForURL(
    `${E2E_EMPLOYEES_URL}/en/${account.organizationSlug}/employees**`,
    { timeout: 60_000 }
  )
  await expect(
    page.getByRole("heading", { name: "Time & attendance", level: 2 })
  ).toBeVisible()
})

test("the owner sees the payroll tab and the salary settings", async ({
  page,
}) => {
  const account = await signUp(page)
  await openEmployees(page, account.organizationSlug)

  // Owners act as admins: payroll and the salary profiles are part of the
  // payload and of the tab list.
  await expect(page.getByRole("tab", { name: "Payroll" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Admin" })).toBeVisible()
})
