import { expect, type Page } from "@playwright/test"

import { prisma } from "@workspace/db"

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
 * Create a project directly for an organization and return its id.
 *
 * Project screens now live in `apps/projects` (#160), so the Copilot e2e suite
 * cannot create them through the UI. The portal tests only need a project row
 * to link to a client; seeding it through the shared projects database keeps
 * the portal spec independent of the projects app's dev server.
 */
export async function createProject(
  organizationSlug: string,
  name: string
): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true },
  })
  if (!organization) throw new Error(`Unknown organization: ${organizationSlug}`)

  const owner = await prisma.member.findFirst({
    where: { organizationId: organization.id, role: "owner" },
    select: { userId: true },
  })

  const project = await prisma.project.create({
    data: {
      organizationId: organization.id,
      name,
      ...(owner ? { members: { create: [{ userId: owner.userId }] } } : {}),
    },
    select: { id: true },
  })
  return project.id
}


/**
 * Create a client company directly for an organization and return its id.
 *
 * The CRM screens moved to `apps/clients` (#163), so the Copilot e2e suite
 * cannot create them through the UI. The portal tests only need a client row
 * to link a project and an invitation to; seeding it through the shared
 * database keeps the portal spec independent of the clients app's dev server.
 */
export async function createClient(
  organizationSlug: string,
  name: string
): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true },
  })
  if (!organization) throw new Error(`Unknown organization: ${organizationSlug}`)

  const client = await prisma.client.create({
    data: { organizationId: organization.id, name, status: "active" },
    select: { id: true },
  })
  return client.id
}

/** Link a project to a client company (the portal visibility rule). */
export async function linkProjectToClient(
  projectId: string,
  clientId: string
): Promise<void> {
  await prisma.project.update({ where: { id: projectId }, data: { clientId } })
}

/**
 * Invite an email to the client portal the way the clients app will: a Better
 * Auth organization invitation (issued with the owner's session) plus the
 * `portalInvite` row the portal claims on acceptance.
 */
export async function invitePortalClient(
  page: Page,
  organizationSlug: string,
  clientId: string,
  email: string
): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true },
  })
  if (!organization) throw new Error(`Unknown organization: ${organizationSlug}`)

  const invitation = await page.request.post(
    "/api/auth/organization/invite-member",
    {
      headers: { Origin: ORIGIN },
      data: { email, role: "client", organizationId: organization.id },
    }
  )
  expect(invitation.ok(), await invitation.text()).toBeTruthy()
  const invitationId = ((await invitation.json()) as { id: string }).id

  const owner = await prisma.member.findFirst({
    where: { organizationId: organization.id, role: "owner" },
    select: { userId: true },
  })

  await prisma.portalInvite.create({
    data: {
      organizationId: organization.id,
      clientId,
      email,
      invitationId,
      invitedById: owner?.userId ?? null,
    },
  })

  return invitationId
}
