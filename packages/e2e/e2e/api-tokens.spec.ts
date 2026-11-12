import { expect, test, type Page } from "@playwright/test"

import { SERVICE_SCOPES, internalAudience } from "@workspace/contracts"

import { closeDatabase, findOrganizationBySlug, query } from "./db"
import { E2E_COPILOT_URL, E2E_PROJECTS_URL } from "./env"
import {
  createOrganization,
  internalRequest,
  requireServiceToken,
  signUp,
  type E2EAccount,
} from "./fixtures"

/**
 * Personal access tokens and `/api/v1` (#133, ADR 0042): a token created in
 * Settings → Developers reaches the projects app through Copilot's delegated
 * call, is limited by its scopes, cannot see another organization, is named in
 * the projects audit row and stops working once revoked.
 */

test.afterAll(closeDatabase)

/** A project created through the projects app's own domain operation. */
async function createProject(account: E2EAccount, organizationId: string) {
  const token = await requireServiceToken({
    audience: internalAudience("projects"),
    scopes: [SERVICE_SCOPES.domainWrite],
  })
  const response = await internalRequest(
    E2E_PROJECTS_URL,
    "/internal/v1/domain/create-project",
    {
      token,
      method: "POST",
      body: {
        context: {
          userId: account.userId,
          userName: account.name,
          userEmail: account.email,
          organizationId,
          role: "owner",
          roles: ["owner"],
          impersonatedBy: null,
          portal: null,
        },
        input: { name: `API e2e ${Date.now()}` },
      },
    }
  )
  expect(response.status, JSON.stringify(response.body)).toBe(200)
  return response.body.data as { id: string }
}

/** Creates a token in Settings → Developers and returns the one-time secret. */
async function createToken(
  page: Page,
  organizationSlug: string,
  name: string,
  extraScopes: string[]
) {
  await page.goto(
    `${E2E_COPILOT_URL}/en/${organizationSlug}/settings?tab=developers`
  )
  await page.getByRole("button", { name: "Create token" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name").fill(name)
  for (const scope of extraScopes) {
    await dialog.getByRole("checkbox", { name: new RegExp(scope) }).check()
  }
  await dialog.getByRole("button", { name: "Create token" }).click()
  const secret = await dialog.locator("#api-token-secret").inputValue()
  expect(secret).toMatch(/^asy_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/)
  await dialog.getByRole("button", { name: "Done" }).click()
  return { secret, prefix: secret.slice(0, 12) }
}

test("a personal access token drives /api/v1 within its scope and organization", async ({
  page,
  playwright,
}) => {
  const account = await signUp(page)
  const project = await createProject(account, account.organizationId)

  const readOnly = await createToken(
    page,
    account.organizationSlug,
    "read only",
    []
  )
  const ci = await createToken(page, account.organizationSlug, "ci", [
    "projects:read",
    "tasks:write",
  ])

  // A cookie-free client, like curl or the CLI.
  const api = await playwright.request.newContext({ baseURL: E2E_COPILOT_URL })
  const as = (secret: string) => ({ Authorization: `Bearer ${secret}` })

  const me = await api.get("/api/v1/token", { headers: as(ci.secret) })
  expect(me.status()).toBe(200)
  expect((await me.json()).data).toMatchObject({
    prefix: ci.prefix,
    user: { email: account.email },
    organization: { slug: account.organizationSlug },
  })

  // The scope is checked even though the owner may create tasks.
  const refused = await api.post("/api/v1/tasks", {
    headers: as(readOnly.secret),
    data: { projectId: project.id, title: "Should not exist" },
  })
  expect(refused.status()).toBe(403)
  expect((await refused.json()).error.code).toBe("token_scope_missing")

  // Creating twice with one key yields one task with a native identifier.
  const body = {
    projectId: project.id,
    title: "Created by the API",
    priority: "high",
  }
  const headers = { ...as(ci.secret), "Idempotency-Key": `e2e-${Date.now()}` }
  const created = await api.post("/api/v1/tasks", { headers, data: body })
  expect(created.status(), await created.text()).toBe(201)
  const task = (await created.json()).data
  expect(task.identifier).toMatch(/^[A-Z]+-\d+$/)
  expect(task.url).toBe(
    `${E2E_PROJECTS_URL}/en/${account.organizationSlug}/projects/${project.id}?task=${task.id}`
  )
  const retried = await api.post("/api/v1/tasks", { headers, data: body })
  expect((await retried.json()).data.id).toBe(task.id)

  const listed = await api.get(`/api/v1/tasks?projectId=${project.id}`, {
    headers: as(ci.secret),
  })
  const titles = ((await listed.json()).data as { title: string }[]).map(
    (item) => item.title
  )
  expect(titles.filter((title) => title === "Created by the API")).toHaveLength(
    1
  )
  expect(titles).not.toContain("Should not exist")

  // The projects app audits the change as the owner, naming the token.
  const audit = await query<{ actorEmail: string; userAgent: string }>(
    `select "actorEmail", "userAgent" from "auditLog" where "entityId" = $1 and action = 'task.created'`,
    [task.id],
    "projects"
  )
  expect(audit).toHaveLength(1)
  expect(audit[0]).toMatchObject({ actorEmail: account.email })
  expect(audit[0]!.userAgent).toContain(`token ${ci.prefix}`)

  // Revoking in the UI stops the token on the next request.
  await page.goto(
    `${E2E_COPILOT_URL}/en/${account.organizationSlug}/settings?tab=developers`
  )
  const row = page.getByRole("row", { name: /read only/ })
  await row.getByRole("button", { name: "Revoke" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Revoke" })
    .click()
  await expect(row.getByText("Revoked")).toBeVisible()
  const revoked = await api.get("/api/v1/token", {
    headers: as(readOnly.secret),
  })
  expect(revoked.status()).toBe(401)
  expect((await revoked.json()).error.code).toBe("token_revoked")

  // Another organization of the same owner stays out of reach of this token.
  const otherSlug = await createOrganization(page, "API e2e other")
  const other = await findOrganizationBySlug(otherSlug)
  const otherProject = await createProject(account, other.id)
  const crossOrg = await api.get(`/api/v1/tasks?projectId=${otherProject.id}`, {
    headers: as(ci.secret),
  })
  expect(crossOrg.status()).toBe(404)

  await api.dispose()
})
