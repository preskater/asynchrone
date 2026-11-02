import { expect, test } from "@playwright/test"

import { SERVICE_SCOPES, internalAudience } from "@workspace/contracts"

import { closeDatabase, oidcSessionsForUser, poisonAccessToken } from "./db"
import {
  E2E_CALENDARS_URL,
  E2E_CONTROL_TOWER_OAUTH_CLIENT_ID,
  E2E_CONTROL_TOWER_OAUTH_CLIENT_SECRET,
  E2E_COPILOT_URL,
  E2E_PROJECTS_URL,
} from "./env"
import {
  internalRequest,
  mintServiceToken,
  openProjects,
  requireServiceToken,
  signUp,
} from "./fixtures"

/**
 * Audience binding and stale-session rejection (#210).
 *
 * A service token names exactly one app (`urn:asynchrone:app:<key>`); every
 * other app's verifier rejects it. A relying-party session whose stored token
 * can no longer be verified is deleted, never trusted.
 */

const REVOKE = "/internal/v1/auth/revoke"
const UNKNOWN_SID = "cross-app-e2e-unknown-sid"

test.afterAll(closeDatabase)

test("a Projects token is rejected by Calendars and vice versa", async () => {
  const projectsToken = await requireServiceToken({
    audience: internalAudience("projects"),
    scopes: [SERVICE_SCOPES.domainWrite],
  })
  const calendarsToken = await requireServiceToken({
    audience: internalAudience("calendars"),
    scopes: [SERVICE_SCOPES.domainWrite],
  })

  // Each token is accepted by the app it was minted for …
  const ownProjects = await internalRequest(E2E_PROJECTS_URL, REVOKE, {
    token: projectsToken,
    method: "POST",
    body: { sid: UNKNOWN_SID },
  })
  expect(ownProjects.status, JSON.stringify(ownProjects.body)).toBe(204)

  const ownCalendars = await internalRequest(E2E_CALENDARS_URL, REVOKE, {
    token: calendarsToken,
    method: "POST",
    body: { sid: UNKNOWN_SID },
  })
  expect(ownCalendars.status, JSON.stringify(ownCalendars.body)).toBe(204)

  // … and rejected by the other one, even with the right scope: the audience
  // check runs before the handler, so no session is touched.
  const projectsOnCalendars = await internalRequest(E2E_CALENDARS_URL, REVOKE, {
    token: projectsToken,
    method: "POST",
    body: { sid: UNKNOWN_SID },
  })
  expect(projectsOnCalendars.status).toBe(401)
  expect(projectsOnCalendars.body.error).toBe("invalid_token")

  const calendarsOnProjects = await internalRequest(E2E_PROJECTS_URL, REVOKE, {
    token: calendarsToken,
    method: "POST",
    body: { sid: UNKNOWN_SID },
  })
  expect(calendarsOnProjects.status).toBe(401)
  expect(calendarsOnProjects.body.error).toBe("invalid_token")
})

test("the control-tower admin surface is audience- and scope-bound", async ({
  page,
}) => {
  const account = await signUp(page)

  // A valid control-tower token without `internal:identity:admin` is refused
  // by the admin handler itself, not by the signature check.
  const readonly = await requireServiceToken({
    clientId: E2E_CONTROL_TOWER_OAUTH_CLIENT_ID,
    clientSecret: E2E_CONTROL_TOWER_OAUTH_CLIENT_SECRET,
    audience: internalAudience("copilot"),
    scopes: [SERVICE_SCOPES.identityRead],
  })
  const forbidden = await internalRequest(
    E2E_COPILOT_URL,
    "/internal/v1/admin/handoffs",
    {
      token: readonly,
      method: "POST",
      body: { userId: account.userId },
    }
  )
  expect(forbidden.status).toBe(403)
  expect((forbidden.body.error as { code?: string } | undefined)?.code).toBe(
    "insufficient_scope"
  )

  // A domain token cannot reach the admin surface at all: the audience is
  // Copilot, so the signature/audience check fails first.
  const domainToken = await requireServiceToken({
    audience: internalAudience("projects"),
    scopes: [SERVICE_SCOPES.domainWrite],
  })
  const misdirected = await internalRequest(
    E2E_COPILOT_URL,
    "/internal/v1/admin/handoffs",
    {
      token: domainToken,
      method: "POST",
      body: { userId: account.userId },
    }
  )
  expect(misdirected.status).toBe(401)
  expect((misdirected.body.error as { code?: string } | undefined)?.code).toBe(
    "invalid_token"
  )

  // The control tower's client cannot request a domain scope at all: the
  // token endpoint rejects the request instead of minting a narrower token.
  const overreach = await mintServiceToken({
    clientId: E2E_CONTROL_TOWER_OAUTH_CLIENT_ID,
    clientSecret: E2E_CONTROL_TOWER_OAUTH_CLIENT_SECRET,
    audience: internalAudience("projects"),
    scopes: [SERVICE_SCOPES.domainWrite],
  })
  expect(overreach.status).toBe(400)
  expect(overreach.body.error).toBe("invalid_scope")
})

test("a stale domain session is rejected and never reused", async ({
  page,
}) => {
  const account = await signUp(page)
  await openProjects(page, account.organizationSlug)

  const [session] = await oidcSessionsForUser(account.userId)
  expect(session).toBeTruthy()

  // Expired access token and no refresh token: the next request cannot make
  // it valid again, so the app must drop the row and start a new flow.
  await poisonAccessToken(session!.id)

  const rejected = await page.request.get(
    `${E2E_PROJECTS_URL}/en/${account.organizationSlug}/projects`,
    { maxRedirects: 0 }
  )
  expect(rejected.status()).toBe(307)
  expect(rejected.headers()["location"]).toContain("/sign-in")

  expect(await oidcSessionsForUser(account.userId)).toHaveLength(0)

  // The Copilot session is still alive, so the browser recovers silently —
  // with a brand-new local session, never the poisoned one.
  await page.goto(`${E2E_PROJECTS_URL}/en/${account.organizationSlug}/projects`)
  await page.waitForURL(
    `${E2E_PROJECTS_URL}/en/${account.organizationSlug}/projects**`,
    { timeout: 60_000 }
  )
  await expect(
    page.getByRole("heading", { name: "Projects", level: 2 })
  ).toBeVisible()

  const [renewed] = await oidcSessionsForUser(account.userId)
  expect(renewed).toBeTruthy()
  expect(renewed?.id).not.toBe(session!.id)
})
