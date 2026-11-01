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
 * Create a fresh account through the Better Auth API (registration is open)
 * and an organization, returning the organization slug. Uses `page.request`
 * so the session cookies are shared with the browser context.
 */
export async function signUp(page: Page): Promise<string> {
  const email = uniqueEmail()
  // Random so the breached-password check (HIBP) never rejects it.
  const password = `e2e-${crypto.randomUUID()}`
  const name = "E2E User"

  const signUpRes = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: ORIGIN },
    data: { email, password, name },
  })
  expect(signUpRes.ok(), await signUpRes.text()).toBeTruthy()

  const slug = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const orgRes = await page.request.post("/api/auth/organization/create", {
    headers: { Origin: ORIGIN },
    data: { name: `E2E Org ${slug}`, slug },
  })
  expect(orgRes.ok(), await orgRes.text()).toBeTruthy()

  return slug
}
