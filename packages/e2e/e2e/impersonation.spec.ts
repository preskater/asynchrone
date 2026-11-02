import { expect, test, type Browser } from "@playwright/test"

import { SERVICE_SCOPES, internalAudience } from "@workspace/contracts"

import {
  backdateCopilotSession,
  closeDatabase,
  copilotImpersonationSessions,
  oidcSessionsForUser,
} from "./db"
import {
  E2E_CONTROL_TOWER_OAUTH_CLIENT_ID,
  E2E_CONTROL_TOWER_OAUTH_CLIENT_SECRET,
  E2E_COPILOT_URL,
  E2E_PROJECTS_URL,
  IMPERSONATION_TTL_MS,
} from "./env"
import {
  internalRequest,
  openProjects,
  requireServiceToken,
  signUp,
  type E2EAccount,
} from "./fixtures"

/**
 * Impersonation across the fleet (#210).
 *
 * The control tower never shares a cookie with Copilot (ADR 0018): it asks
 * Copilot's admin API for a single-use handoff, and `/api/platform/handoff`
 * claims it, opens a session marked `impersonatedBy` and caps it at one hour.
 * The domain apps read the Copilot session, render the banner and enforce the
 * same TTL.
 */

test.afterAll(closeDatabase)

interface Handoff {
  url: string
}

async function createHandoff(
  operator: E2EAccount,
  target: E2EAccount
): Promise<Handoff> {
  // Exactly what the control tower's `startImpersonation` action calls: the
  // platform service client, `internal:identity:admin`, on Copilot's audience.
  const token = await requireServiceToken({
    clientId: E2E_CONTROL_TOWER_OAUTH_CLIENT_ID,
    clientSecret: E2E_CONTROL_TOWER_OAUTH_CLIENT_SECRET,
    audience: internalAudience("copilot"),
    scopes: [SERVICE_SCOPES.identityAdmin],
  })

  const response = await internalRequest(
    E2E_COPILOT_URL,
    "/internal/v1/admin/handoffs",
    {
      token,
      method: "POST",
      body: {
        userId: target.userId,
        organizationId: target.organizationId,
        actorId: operator.userId,
      },
    }
  )
  expect(response.status, JSON.stringify(response.body)).toBe(200)

  const data = response.body.data as { url: string }
  expect(data.url).toContain("/api/platform/handoff?token=")
  return { url: data.url }
}

/** A target account in its own browser context (its own Copilot session). */
async function createTarget(
  browser: Browser
): Promise<{ account: E2EAccount; close: () => Promise<void> }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const account = await signUp(page)
  return { account, close: () => context.close() }
}

test("a single-use handoff opens an impersonated session on Copilot and Projects", async ({
  page,
  browser,
}) => {
  const operator = await signUp(page)
  const target = await createTarget(browser)
  const impersonated = await browser.newContext()
  const impersonatedPage = await impersonated.newPage()

  try {
    const handoff = await createHandoff(operator, target.account)

    // Copilot consumes the grant, opens the session and sends the operator to
    // the target's organization.
    await impersonatedPage.goto(handoff.url)
    await impersonatedPage.waitForURL(
      new RegExp(`/en/${target.account.organizationSlug}`),
      { timeout: 60_000 }
    )
    await expect(
      impersonatedPage.getByText(`Impersonating ${target.account.name}`)
    ).toBeVisible()
    await expect(
      impersonatedPage.getByRole("button", { name: "Stop impersonating" })
    ).toBeVisible()

    // The session records the operator and lives one hour, not the customer
    // session's seven days: the handoff caps both the cookie and (independently
    // of later writes) the workspace gate, which the next test pins.
    const [session] = await copilotImpersonationSessions(target.account.userId)
    expect(session?.impersonatedBy).toBe(operator.userId)
    const cookies = await impersonated.cookies(E2E_COPILOT_URL)
    const cookie = cookies.find((entry) => entry.name.includes("session_token"))
    expect(cookie, "impersonation cookie").toBeTruthy()
    const cookieSeconds = (cookie!.expires * 1000 - Date.now()) / 1000
    expect(cookieSeconds).toBeGreaterThan(IMPERSONATION_TTL_MS / 1000 - 120)
    expect(cookieSeconds).toBeLessThanOrEqual(IMPERSONATION_TTL_MS / 1000 + 120)

    // The grant is single use: a replay never opens a second session.
    const replay = await impersonatedPage.request.get(handoff.url, {
      maxRedirects: 0,
    })
    expect(replay.status()).toBe(307)
    expect(replay.headers()["location"]).toContain(
      "error=invalid-impersonation-link"
    )
    expect(
      await copilotImpersonationSessions(target.account.userId)
    ).toHaveLength(1)

    // The domain app authorizes the impersonated Copilot session and renders
    // the banner too: the operator sees whose workspace they are in.
    await openProjects(impersonatedPage, target.account.organizationSlug)
    await expect(
      impersonatedPage.getByRole("heading", { name: "Projects", level: 2 })
    ).toBeVisible()
    await expect(
      impersonatedPage.getByText(`Impersonating ${target.account.name}`)
    ).toBeVisible()
  } finally {
    await impersonated.close()
    await target.close()
  }
})

test("a domain app refuses an impersonation older than one hour", async ({
  page,
  browser,
}) => {
  const operator = await signUp(page)
  const target = await createTarget(browser)
  const impersonated = await browser.newContext()
  const impersonatedPage = await impersonated.newPage()

  try {
    const handoff = await createHandoff(operator, target.account)
    await impersonatedPage.goto(handoff.url)
    await impersonatedPage.waitForURL(
      new RegExp(`/en/${target.account.organizationSlug}`),
      { timeout: 60_000 }
    )
    await openProjects(impersonatedPage, target.account.organizationSlug)
    expect(await oidcSessionsForUser(target.account.userId)).toHaveLength(1)

    const [session] = await copilotImpersonationSessions(target.account.userId)
    // Only `createdAt` moves: the Copilot session itself is still valid, so
    // the domain app's TTL gate (not the session expiry) rejects the request.
    await backdateCopilotSession(session!.id)

    const gate = await impersonatedPage.request.get(
      `${E2E_PROJECTS_URL}/en/${target.account.organizationSlug}/projects`,
      { maxRedirects: 0 }
    )
    expect(gate.status()).toBe(307)
    expect(gate.headers()["location"]).toContain("error=impersonation-expired")
    // The relying party dropped its own session; the Copilot session is only
    // ended by Copilot's own gate (next test).
    expect(await oidcSessionsForUser(target.account.userId)).toHaveLength(0)
  } finally {
    await impersonated.close()
    await target.close()
  }
})

test("Copilot ends an impersonation older than one hour", async ({
  page,
  browser,
}) => {
  const operator = await signUp(page)
  const target = await createTarget(browser)
  const impersonated = await browser.newContext()
  const impersonatedPage = await impersonated.newPage()

  try {
    const handoff = await createHandoff(operator, target.account)
    await impersonatedPage.goto(handoff.url)
    await impersonatedPage.waitForURL(
      new RegExp(`/en/${target.account.organizationSlug}`),
      { timeout: 60_000 }
    )

    const [session] = await copilotImpersonationSessions(target.account.userId)
    await backdateCopilotSession(session!.id)

    // The workspace layout ends the expired session and sends the browser to
    // sign-in instead of serving the assistant.
    await impersonatedPage.goto(
      `${E2E_COPILOT_URL}/en/${target.account.organizationSlug}`
    )
    await impersonatedPage.waitForURL(/\/sign-in/, { timeout: 60_000 })
    expect(
      await copilotImpersonationSessions(target.account.userId)
    ).toHaveLength(0)
  } finally {
    await impersonated.close()
    await target.close()
  }
})

test("stop impersonating ends the Copilot session and every app session", async ({
  page,
  browser,
}) => {
  const operator = await signUp(page)
  const target = await createTarget(browser)
  const impersonated = await browser.newContext()
  const impersonatedPage = await impersonated.newPage()

  try {
    const handoff = await createHandoff(operator, target.account)
    await impersonatedPage.goto(handoff.url)
    await impersonatedPage.waitForURL(
      new RegExp(`/en/${target.account.organizationSlug}`),
      { timeout: 60_000 }
    )
    await openProjects(impersonatedPage, target.account.organizationSlug)
    expect(await oidcSessionsForUser(target.account.userId)).toHaveLength(1)

    // The banner action posts to Copilot, which deletes the session through
    // Better Auth (firing back-channel logout) and fans out a revoke, then
    // returns the operator to the control tower.
    const stopped = await impersonatedPage.request.post(
      `${E2E_COPILOT_URL}/api/platform/stop-impersonating`,
      { maxRedirects: 0 }
    )
    expect(stopped.status()).toBe(307)
    expect(stopped.headers()["location"]).toBe("http://127.0.0.1:3098/overview")

    await expect
      .poll(
        async () => (await oidcSessionsForUser(target.account.userId)).length
      )
      .toBe(0)
    await expect
      .poll(
        async () =>
          (await copilotImpersonationSessions(target.account.userId)).length
      )
      .toBe(0)

    // The workspace is gone: the next request signs the browser out.
    await impersonatedPage.goto(
      `${E2E_COPILOT_URL}/en/${target.account.organizationSlug}`
    )
    await impersonatedPage.waitForURL(/\/sign-in/, { timeout: 60_000 })
  } finally {
    await impersonated.close()
    await target.close()
  }
})
