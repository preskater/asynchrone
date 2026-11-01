import { expect, type Page } from "@playwright/test"

import { E2E_BASE_URL } from "./env"

export function uniqueEmail() {
  return `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`
}

// Better Auth enforces a CSRF origin check on its endpoints; Playwright's API
// request context does not send an Origin header, so add it explicitly. It
// must match BETTER_AUTH_URL, which `playwright.config.ts` derives from the
// same value.
const ORIGIN = E2E_BASE_URL

/**
 * Register a fresh account through the Better Auth API (registration is open)
 * and return its email. Uses `page.request` so the session cookies are shared
 * with the browser context.
 *
 * Pass an email to register the address an invitation was issued for — a
 * client-portal account is created by accepting an invitation, never by
 * creating an organization.
 */
export async function register(
  page: Page,
  email = uniqueEmail()
): Promise<string> {
  // Random so the breached-password check (HIBP) never rejects it.
  const password = `e2e-${crypto.randomUUID()}`
  const name = "E2E User"

  const signUpRes = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: ORIGIN },
    data: { email, password, name },
  })
  expect(signUpRes.ok(), await signUpRes.text()).toBeTruthy()

  return email
}

/** Create an account and its organization, returning the organization slug. */
export async function signUp(page: Page): Promise<string> {
  await register(page)

  const slug = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const orgRes = await page.request.post("/api/auth/organization/create", {
    headers: { Origin: ORIGIN },
    data: { name: `E2E Org ${slug}`, slug },
  })
  expect(orgRes.ok(), await orgRes.text()).toBeTruthy()

  return slug
}

/**
 * Create a project from the projects page and return its persisted id.
 */
export async function createProject(page: Page, name: string): Promise<string> {
  const dialog = page.getByRole("dialog")
  // Retry the click: a click that lands before hydration is a no-op.
  await expect(async () => {
    await page.getByRole("button", { name: "Create project" }).first().click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await dialog.getByLabel("Name", { exact: true }).fill(name)
  await dialog.getByRole("button", { name: "Create", exact: true }).click()

  const link = page.getByRole("link", { name })
  await expect(link).toBeVisible({ timeout: 15_000 })
  // The store first shows an optimistic `p_…` id; wait for the persisted
  // cuid to land before reading the link. A cold `next dev` action can take a
  // few seconds, so allow for it.
  await expect(link).toHaveAttribute("href", /\/projects\/c[a-z0-9]+$/, {
    timeout: 30_000,
  })
  const href = await link.getAttribute("href")
  return href!.split("/").pop()!
}
