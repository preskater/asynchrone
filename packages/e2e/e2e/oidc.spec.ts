import { expect, test } from "@playwright/test"

import {
  closeDatabase,
  copilotSessionForUser,
  duplicateAppSession,
  expireAccessToken,
  oidcSessionsForUser,
} from "./db"
import { E2E_CALENDARS_URL, E2E_COPILOT_URL, E2E_PROJECTS_URL } from "./env"
import {
  createOrganization,
  openCalendars,
  openCopilot,
  openProjects,
  sessionCookies,
  signUp,
} from "./fixtures"

/**
 * The cross-app OIDC lifecycle (#210): one Copilot session, two relying
 * parties on different hosts, no shared cookie.
 *
 * Copilot issues every token; projects and calendars each keep a host-only
 * session in their own app (the shared `oidcSession` table while the database
 * split is in progress) and verify the token's audience on every request.
 */

test.afterAll(closeDatabase)

test("signs in on Copilot, opens Projects and refreshes the access token", async ({
  page,
  context,
}) => {
  const account = await signUp(page)

  await openCopilot(page, account.organizationSlug)
  await expect(
    page.getByRole("heading", { name: "Asynchrone Space assistant" })
  ).toBeVisible()

  // The first request has no local session: projects start the code + PKCE
  // flow against Copilot and store their own session row.
  await openProjects(page, account.organizationSlug)
  await expect(
    page.getByRole("heading", { name: "Projects", level: 2 })
  ).toBeVisible()

  // The session cookie is host-only and belongs to the projects origin; the
  // Copilot session cookie is a different cookie with a different name.
  const cookies = await sessionCookies(context, E2E_PROJECTS_URL)
  expect(cookies).toHaveLength(1)
  expect(cookies[0]?.domain).toBe("localhost")
  expect(cookies[0]?.httpOnly).toBe(true)
  expect(cookies[0]?.name).toBe(
    cookies[0]?.name.startsWith("__Host-")
      ? "__Host-asynchrone_session"
      : "asynchrone_session"
  )

  const [before] = await oidcSessionsForUser(account.userId)
  expect(before, "projects session row").toBeTruthy()

  // Age the stored access token: the next request takes the refresh-token
  // grant, stores the new token and still serves the page.
  //
  // This uses one document request rather than `page.reload()`: Copilot rotates
  // refresh tokens, and the browser's router can prefetch the same route
  // concurrently, which makes two requests race for one rotation. The app
  // tolerates the race (it keeps the winner's token instead of signing out) but
  // a single request is what pins the refresh itself.
  await expireAccessToken(before!.id)
  const refreshed = await page.request.get(
    `${E2E_PROJECTS_URL}/en/${account.organizationSlug}/projects`,
    { maxRedirects: 0 }
  )
  expect(refreshed.status()).toBe(200)

  const [after] = await oidcSessionsForUser(account.userId)
  expect(after?.id).toBe(before!.id)
  expect(after?.accessToken).not.toBe(before!.accessToken)
  expect(new Date(after!.accessTokenExpiresAt).getTime()).toBeGreaterThan(
    Date.now()
  )

  // The refreshed token is what the browser now renders with.
  await page.reload()
  await expect(
    page.getByRole("heading", { name: "Projects", level: 2 })
  ).toBeVisible()
})

test("switching organization revokes the other app's session", async ({
  page,
  context,
}) => {
  const account = await signUp(page)
  // Creating an organization makes it Copilot's active one, so both apps are
  // first authorized for it.
  const secondSlug = await createOrganization(page, "Second Org")

  await openProjects(page, secondSlug)
  await expect(
    page.getByRole("heading", { name: "Projects", level: 2 })
  ).toBeVisible()

  // The projects cookie is host-only; Copilot's session cookie has a
  // different name on the same host, so the two never collide.
  expect(await sessionCookies(context, E2E_PROJECTS_URL)).toHaveLength(1)

  // Model the sibling app's session in its own table (see
  // `duplicateAppSession`): the switch must end every local session bound to
  // the Copilot sign-in, not just this app's.
  const [projectsSession] = await oidcSessionsForUser(account.userId)
  const siblingId = await duplicateAppSession(projectsSession!.id)
  expect(await oidcSessionsForUser(account.userId)).toHaveLength(2)

  // The switcher is a handoff: projects end their session, Copilot updates the
  // active organization and every domain app's `/internal/v1/auth/revoke`
  // drops the sessions bound to this Copilot sign-in.
  await page.getByRole("button", { name: /Second Org/i }).click()
  await page.getByRole("menuitem", { name: /Cross App HQ/i }).click()
  await page.waitForURL(/\/select-organization\?/)

  await page.getByRole("button", { name: /Cross App HQ/i }).click()
  await page.waitForURL(
    `${E2E_PROJECTS_URL}/en/${account.organizationSlug}/projects**`,
    { timeout: 60_000 }
  )
  await expect(
    page.getByRole("heading", { name: "Projects", level: 2 })
  ).toBeVisible()

  // Only the new, first-organization session exists; the previous row and the
  // sibling (the other app's) row are gone.
  const after = await oidcSessionsForUser(account.userId)
  expect(after).toHaveLength(1)
  expect(after[0]?.organizationId).toBe(account.organizationId)
  expect([projectsSession!.id, siblingId]).not.toContain(after[0]?.id)

  // Calendars was signed out by the fan-out and re-authorizes for the
  // session's active organization; its token is no longer bound to the old
  // one, so the old route redirects to the active organization.
  await page.goto(`${E2E_CALENDARS_URL}/en/${secondSlug}/calendars`)
  await page.waitForURL(
    `${E2E_CALENDARS_URL}/en/${account.organizationSlug}/calendars**`,
    { timeout: 60_000 }
  )
})

test("back-channel logout ends every workspace app's session", async ({
  page,
  context,
}) => {
  const account = await signUp(page)
  await openProjects(page, account.organizationSlug)
  await openCalendars(page, account.organizationSlug)

  // Both apps set their own host-only cookie on their own host.
  expect(await sessionCookies(context, E2E_PROJECTS_URL)).toHaveLength(1)
  expect(await sessionCookies(context, E2E_CALENDARS_URL)).toHaveLength(1)

  // Model the sibling app's session in its own table (see
  // `duplicateAppSession`) so the logout token has to remove both rows.
  const [calendarsSession] = await oidcSessionsForUser(account.userId)
  const siblingId = await duplicateAppSession(calendarsSession!.id)
  expect(await oidcSessionsForUser(account.userId)).toHaveLength(3)
  expect(await copilotSessionForUser(account.userId)).not.toBeNull()

  // Signing out of Copilot deletes the Copilot session, which dispatches a
  // signed Logout Token to every registered back-channel endpoint.
  const signOut = await page.request.post(
    `${E2E_COPILOT_URL}/api/auth/sign-out`,
    { headers: { Origin: E2E_COPILOT_URL }, data: {} }
  )
  expect(signOut.ok(), await signOut.text()).toBeTruthy()

  await expect
    .poll(async () => (await oidcSessionsForUser(account.userId)).length, {
      timeout: 30_000,
    })
    .toBe(0)
  // Neither the app's own row nor the sibling row survived the logout token.
  const remaining = await oidcSessionsForUser(account.userId)
  expect(
    remaining.filter((session) =>
      [calendarsSession!.id, siblingId].includes(session.id)
    )
  ).toHaveLength(0)
  expect(await copilotSessionForUser(account.userId)).toBeNull()

  // Both apps now send the browser back into the sign-in flow: their own
  // host-only cookie may still be present, but the row behind it is gone.
  await page.goto(`${E2E_PROJECTS_URL}/en/${account.organizationSlug}/projects`)
  await page.waitForURL(/\/sign-in/, { timeout: 60_000 })
  expect(page.url().startsWith(E2E_COPILOT_URL)).toBe(true)

  await page.goto(
    `${E2E_CALENDARS_URL}/en/${account.organizationSlug}/calendars`
  )
  await page.waitForURL(/\/sign-in/, { timeout: 60_000 })
  expect(page.url().startsWith(E2E_COPILOT_URL)).toBe(true)
})
