import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { expect, type BrowserContext, type Page } from "@playwright/test"

import { findOrganizationBySlug, findUserByEmail } from "./db"
import {
  E2E_CALENDARS_URL,
  E2E_COPILOT_URL,
  E2E_COPILOT_OAUTH_CLIENT_ID,
  E2E_COPILOT_OAUTH_CLIENT_SECRET,
  E2E_PROJECTS_URL,
} from "./env"

export const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
)

export function uniqueEmail(prefix = "cross_app_e2e"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`
}

/**
 * Better Auth enforces a CSRF origin check on its endpoints; Playwright's API
 * request context sends no Origin header, so pass the Copilot origin
 * explicitly (it must equal `BETTER_AUTH_URL`).
 */
const COPILOT_ORIGIN = E2E_COPILOT_URL

export interface E2EAccount {
  userId: string
  email: string
  password: string
  name: string
  organizationId: string
  organizationSlug: string
}

/** Create an account and its first organization through Copilot's API. */
export async function signUp(page: Page): Promise<E2EAccount> {
  const email = uniqueEmail()
  const password = `cross-app-e2e-${crypto.randomUUID()}`
  const name = "Cross App E2E"

  const signUpRes = await page.request.post(
    `${E2E_COPILOT_URL}/api/auth/sign-up/email`,
    {
      headers: { Origin: COPILOT_ORIGIN },
      data: { email, password, name },
    }
  )
  expect(signUpRes.ok(), await signUpRes.text()).toBeTruthy()

  const organizationSlug = await createOrganization(page, "Cross App HQ")
  const user = await findUserByEmail(email)
  const organization = await findOrganizationBySlug(organizationSlug)

  return {
    userId: user.id,
    email,
    password,
    name,
    organizationId: organization.id,
    organizationSlug,
  }
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

/** Open the Copilot workspace for an organization. */
export async function openCopilot(
  page: Page,
  organizationSlug: string
): Promise<void> {
  await page.goto(`${E2E_COPILOT_URL}/en/${organizationSlug}`)
  await page.waitForURL(`${E2E_COPILOT_URL}/en/${organizationSlug}**`, {
    timeout: 60_000,
  })
}

/**
 * Open a domain app for an organization. The first request has no local
 * session, so it walks the full relying-party flow: app `/sign-in` → Copilot
 * authorize → callback → `/{locale}/{orgSlug}/<section>` on the app host.
 */
export async function openApp(
  page: Page,
  appUrl: string,
  organizationSlug: string,
  section: string
): Promise<void> {
  await page.goto(`${appUrl}/en/${organizationSlug}/${section}`)
  await page.waitForURL(`${appUrl}/en/${organizationSlug}/${section}**`, {
    timeout: 60_000,
  })
}

export function openProjects(
  page: Page,
  organizationSlug: string
): Promise<void> {
  return openApp(page, E2E_PROJECTS_URL, organizationSlug, "projects")
}

export function openCalendars(
  page: Page,
  organizationSlug: string
): Promise<void> {
  return openApp(page, E2E_CALENDARS_URL, organizationSlug, "calendars")
}

/** Cookies a single app set on its own origin (never a shared parent domain). */
export async function sessionCookies(
  context: BrowserContext,
  origin: string
): Promise<{ name: string; domain: string; httpOnly: boolean }[]> {
  const cookies = await context.cookies(origin)
  return cookies
    .filter((cookie) => cookie.name.endsWith("asynchrone_session"))
    .map(({ name, domain, httpOnly }) => ({ name, domain, httpOnly }))
}

export interface TokenResponse {
  status: number
  body: Record<string, unknown>
}

/**
 * Client-credentials token from Copilot's OAuth server.
 *
 * The audience and scope set are part of the request: a token minted for one
 * app's `urn:asynchrone:app:<key>` resource is rejected by every other app's
 * verifier (`@workspace/service-auth`).
 */
export async function mintServiceToken({
  clientId = E2E_COPILOT_OAUTH_CLIENT_ID,
  clientSecret = E2E_COPILOT_OAUTH_CLIENT_SECRET,
  audience,
  scopes,
}: {
  clientId?: string
  clientSecret?: string
  audience: string
  scopes: string[]
}): Promise<TokenResponse> {
  const response = await fetch(`${E2E_COPILOT_URL}/api/auth/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      resource: audience,
      scope: scopes.join(" "),
    }),
  })
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  return { status: response.status, body }
}

/** Mint and require a usable token, failing loudly with the issuer's error. */
export async function requireServiceToken(
  input: Parameters<typeof mintServiceToken>[0]
): Promise<string> {
  const { status, body } = await mintServiceToken(input)
  expect(status, JSON.stringify(body)).toBe(200)
  const token = body.access_token
  expect(typeof token, JSON.stringify(body)).toBe("string")
  return token as string
}

/** Call an app's internal API with a service token. */
export async function internalRequest(
  origin: string,
  path: string,
  {
    token,
    method = "GET",
    body,
  }: { token: string; method?: string; body?: unknown }
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const parsed = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  return { status: response.status, body: parsed }
}

/**
 * Run the Copilot-side failure-injection probe
 * (`apps/copilot/scripts/e2e-cross-app-probe.ts`).
 *
 * The probe lives in Copilot because the fan-out, the saga orchestrator and
 * the delegated domain client are Copilot modules; a package may not import
 * an app. It prints one `__PROBE__<json>` line that this helper parses.
 */
export function runProbe<T>(
  command: string,
  args: Record<string, unknown> = {},
  env: Record<string, string> = {}
): T {
  const result = spawnSync(
    resolve(REPO_ROOT, "node_modules/.bin/tsx"),
    ["scripts/e2e-cross-app-probe.ts", command, JSON.stringify(args)],
    {
      // Copilot's tsconfig resolves the `@/*` alias the probe imports.
      cwd: resolve(REPO_ROOT, "apps/copilot"),
      encoding: "utf8",
      env: { ...process.env, ...env },
      timeout: 120_000,
    }
  )
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  const line = output
    .split("\n")
    .reverse()
    .find((entry) => entry.startsWith("__PROBE__"))
  if (result.status !== 0 || !line) {
    throw new Error(
      `probe ${command} failed (exit ${result.status}):\n${output.slice(-4000)}`
    )
  }
  return JSON.parse(line.slice("__PROBE__".length)) as T
}
