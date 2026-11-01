import { expect, type BrowserContext, type Page } from "@playwright/test"

import { prisma } from "@workspace/db"

import { E2E_COPILOT_URL, E2E_MESSAGES_URL } from "./env"

export function uniqueEmail() {
  return `messages_e2e_${Date.now()}_${Math.random()
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
  organizationId: string
  userId: string
}

function uniqueSlug() {
  return `e2e-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`
}

/** Create an account and its first organization through Copilot's API. */
export async function signUp(page: Page): Promise<E2EAccount> {
  const email = uniqueEmail()
  const password = `messages-e2e-${crypto.randomUUID()}`
  const name = "Messages E2E"

  const signUpRes = await page.request.post(
    `${E2E_COPILOT_URL}/api/auth/sign-up/email`,
    {
      headers: { Origin: COPILOT_ORIGIN },
      data: { email, password, name },
    }
  )
  expect(signUpRes.ok(), await signUpRes.text()).toBeTruthy()

  const organizationSlug = await createOrganization(page, "Message HQ")
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug: organizationSlug },
  })

  return {
    email,
    password,
    organizationSlug,
    organizationId: organization.id,
    userId: user.id,
  }
}

/** Create another organization for the same signed-in account. */
export async function createOrganization(
  page: Page,
  name: string
): Promise<string> {
  const organizationSlug = uniqueSlug()
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
 * Seed a channel the signed-in member can open.
 *
 * The suite does not drive Copilot's invitation flow (there is no second
 * person behind the browser); a team + channel row is what the conversation
 * sidebar groups and what the composer writes to.
 */
export async function seedChannel({
  organizationId,
  userId,
  name = "general",
}: {
  organizationId: string
  userId: string
  name?: string
}): Promise<{ teamId: string; conversationId: string }> {
  const team = await prisma.chatTeam.create({
    data: {
      organizationId,
      name: "Message HQ",
      description: "E2E workspace",
    },
  })
  const conversation = await prisma.conversation.create({
    data: {
      organizationId,
      kind: "channel",
      name,
      teamId: team.id,
      members: { create: [{ userId }] },
    },
  })
  return { teamId: team.id, conversationId: conversation.id }
}

/**
 * Open the messages app for an organization. The first request has no local
 * session, so it walks the full flow: messages `/sign-in` → Copilot authorize
 * → callback → `/{locale}/{orgSlug}/messages` on the messages host.
 */
export async function openMessages(
  page: Page,
  organizationSlug: string
): Promise<void> {
  await page.goto(`${E2E_MESSAGES_URL}/en/${organizationSlug}/messages`)
  await page.waitForURL(
    `${E2E_MESSAGES_URL}/en/${organizationSlug}/messages**`,
    { timeout: 60_000 }
  )
  await page.getByRole("heading", { name: "Messages", level: 1 }).waitFor()
}

/** Cookies this app set on its own origin (never a shared parent domain). */
export async function messagesSessionCookies(context: BrowserContext) {
  return context.cookies(E2E_MESSAGES_URL)
}
