import { expect, type BrowserContext, type Page } from "@playwright/test"

import { E2E_COPILOT_URL, E2E_PROJECTS_URL } from "./env"

export function uniqueEmail() {
  return `projects_e2e_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`
}

/**
 * Better Auth enforces a CSRF origin check on its endpoints; Playwright's API
 * request context sends no Origin header, so add the Copilot origin explicitly.
 */
const COPILOT_ORIGIN = E2E_COPILOT_URL

export interface E2EAccount {
  email: string
  password: string
  organizationSlug: string
}

/** Create an account and its first organization through Copilot's API. */
export async function signUp(page: Page): Promise<E2EAccount> {
  const email = uniqueEmail()
  const password = `projects-e2e-${crypto.randomUUID()}`
  const name = "Projects E2E"

  const signUpRes = await page.request.post(
    `${E2E_COPILOT_URL}/api/auth/sign-up/email`,
    {
      headers: { Origin: COPILOT_ORIGIN },
      data: { email, password, name },
    }
  )
  expect(signUpRes.ok(), await signUpRes.text()).toBeTruthy()

  const organizationSlug = await createOrganization(page, "Project HQ")
  return { email, password, organizationSlug }
}

/** Create another organization for the same signed-in account. */
export async function createOrganization(
  page: Page,
  name: string
): Promise<string> {
  const organizationSlug = `e2e-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`
  const res = await page.request.post(
    `${E2E_COPILOT_URL}/api/auth/organization/create`,
    {
      headers: { Origin: COPILOT_ORIGIN },
      data: { name: `${name} ${organizationSlug}`, slug: organizationSlug },
    }
  )
  expect(res.ok(), await res.text()).toBeTruthy()
  return organizationSlug
}

/**
 * Open the projects app for an organization. The first request has no local
 * session, so it walks the full flow: projects `/sign-in` → Copilot authorize →
 * callback → `/{locale}/{orgSlug}/projects` on the projects host.
 */
export async function openProjects(
  page: Page,
  organizationSlug: string
): Promise<void> {
  await page.goto(`${E2E_PROJECTS_URL}/en/${organizationSlug}/projects`)
  await page.waitForURL(
    `${E2E_PROJECTS_URL}/en/${organizationSlug}/projects**`,
    { timeout: 60_000 }
  )
}

/** Cookies this app set on its own origin (never a shared parent domain). */
export async function projectsSessionCookies(context: BrowserContext) {
  return context.cookies(E2E_PROJECTS_URL)
}
