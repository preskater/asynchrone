import { expect, test } from "@playwright/test"

import { E2E_CALENDARS_URL } from "./env"
import {
  calendarsSessionCookies,
  createOrganization,
  openCalendars,
  signUp,
} from "./fixtures"

/**
 * The calendars app end to end: sign-in through Copilot, organization switch
 * and an event flow, all on `calendars.copilot.asynchrone.space` (here
 * localhost:3005) with no in-process Copilot session.
 */

test("signs in through Copilot and loads the calendar on its own host", async ({
  page,
  context,
}) => {
  const account = await signUp(page)

  await openCalendars(page, account.organizationSlug)

  // The calendars host rendered its own screen.
  await expect(page.getByRole("button", { name: "New event" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Week" })).toBeVisible()

  // Meeting settings moved with calendars (#161): they render on this host.
  await page.goto(
    `${E2E_CALENDARS_URL}/en/${account.organizationSlug}/calendars/settings`
  )
  await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible()
  await expect(
    page.getByText("Allow clients to request meetings")
  ).toBeVisible()

  // The session cookie is host-only: set by the calendars origin, without a
  // Domain attribute, and never a `.asynchrone.space` cookie.
  const cookies = await calendarsSessionCookies(context)
  const session = cookies.find((cookie) =>
    cookie.name.endsWith("asynchrone_session")
  )
  expect(session, "calendars session cookie").toBeTruthy()
  expect(session?.domain).toBe("localhost")
  expect(session?.httpOnly).toBe(true)
  expect(cookies.some((cookie) => cookie.name.startsWith("__Host-"))).toBe(
    session?.name.startsWith("__Host-")
  )
})

test("switches organization on the calendars host", async ({ page }) => {
  const account = await signUp(page)
  // Creating an organization makes it Copilot's active one, so the first
  // authorization is issued for it; the switcher then goes back to the first.
  const secondSlug = await createOrganization(page, "Second Org")
  await openCalendars(page, secondSlug)

  // The switcher hands off to Copilot (it owns the session's active
  // organization), then re-authorizes here for the chosen organization.
  await page.getByRole("button", { name: /Second Org/i }).click()
  await page.getByRole("menuitem", { name: /Calendars HQ/i }).click()

  // Copilot owns the active organization, so it asks which one the app should
  // access; choosing it sends the browser back into this app's sign-in flow.
  await page.waitForURL(/\/select-organization\?/)
  await page.getByRole("button", { name: /Calendars HQ/i }).click()

  await page.waitForURL(
    `${E2E_CALENDARS_URL}/en/${account.organizationSlug}/calendars**`,
    { timeout: 60_000 }
  )
  await expect(page.getByRole("button", { name: "New event" })).toBeVisible()
})

test("creates an event on the calendar", async ({ page }) => {
  const account = await signUp(page)
  await openCalendars(page, account.organizationSlug)

  const title = `E2E Event ${Date.now().toString(36)}`

  await page.getByRole("button", { name: "New event" }).first().click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Title").fill(title)
  await dialog.getByRole("button", { name: "Create event" }).click()

  // The event is optimistic until the action resolves; the calendar shows it
  // as soon as the store swaps in the persisted row.
  await expect(page.getByText(/Event .* created/)).toBeVisible()
  await expect(page.getByText(title).first()).toBeVisible()
})
