import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { UserAuditInput } from "@workspace/audit"

import {
  DOMAIN_OPERATIONS,
  guestContextAllowed,
  isGuestOperation,
} from "@workspace/contracts"

import { delegatedGuestContext } from "@/lib/internal/domain"
import { createGuestService } from "@/lib/guests/service"
import { prisma } from "@/lib/prisma"

import {
  createContractFixture,
  rejectionOf,
  type ContractFixture,
} from "./fixtures"

/**
 * External collaborators (ADR 0041): the guest matrix.
 *
 * Mallory (owner of organization B) is invited to one project of
 * organization A. The grant must open that project only, never a membership,
 * and stop working the moment it is revoked, expires or the plan drops it.
 */
describe("external collaborators", () => {
  let fixture: ContractFixture
  let clock = new Date()
  let limit = 5
  // Plain arrays: the suite's mock reset would clear a vi.fn between tests.
  const audits: { organizationId: string; input: UserAuditInput }[] = []
  const sent: string[] = []

  function service() {
    return createGuestService({
      db: prisma,
      async findProject(ctx, projectId) {
        return ctx.organizationId === fixture.orgA &&
          projectId === fixture.projectA
          ? { id: fixture.projectA, name: "Website redesign" }
          : null
      },
      guestLimit: async () => limit,
      audit: async (actor, input) => {
        audits.push({ organizationId: actor.organizationId, input })
      },
      sendInvitation: ({ url }) => {
        sent.push(url)
      },
      acceptUrl: (token) => `https://copilot.test/guest/accept?token=${token}`,
      now: () => clock,
    })
  }

  const tokenOf = (url: string) => new URL(url).searchParams.get("token")!
  const mallory = () => ({
    id: fixture.users.mallory,
    name: "Mallory",
    email: `${fixture.users.mallory}@contract.local`,
  })
  const bob = () => ({
    id: fixture.users.bob,
    name: "Bob",
    email: `${fixture.users.bob}@contract.local`,
  })

  beforeAll(async () => {
    fixture = await createContractFixture()
  })

  afterAll(async () => {
    await fixture.cleanup()
  })

  it("only owners and admins on an entitled plan can invite", async () => {
    const guests = service()
    const input = {
      projectId: fixture.projectA,
      email: mallory().email,
      expiresInDays: 30,
      capabilities: ["task:comment"],
    }
    await expect(
      rejectionOf(guests.invite(fixture.ctxBob, input))
    ).resolves.toMatchObject({ code: "role_cannot_manage_members" })

    limit = 0
    await expect(
      rejectionOf(guests.invite(fixture.ctxAlice, input))
    ).resolves.toMatchObject({ code: "upgrade_required" })
    limit = 5

    // Mallory's own organization cannot reach organization A's project.
    await expect(
      rejectionOf(guests.invite(fixture.ctxMallory, input))
    ).resolves.toMatchObject({ code: "not_found" })
    // A member is already inside; a grant would be a second boundary.
    await expect(
      rejectionOf(
        guests.invite(fixture.ctxAlice, { ...input, email: bob().email })
      )
    ).resolves.toMatchObject({ code: "email_already_member" })
  })

  it("invites, accepts once, and grants the project without a membership", async () => {
    const guests = service()
    const members = await prisma.member.count({
      where: { organizationId: fixture.orgA },
    })
    const { guest } = await guests.invite(fixture.ctxAlice, {
      projectId: fixture.projectA,
      email: mallory().email.toUpperCase(),
      expiresInDays: 30,
      capabilities: ["task:comment", "member:manage"],
    })
    expect(guest).toMatchObject({ state: "invited", email: mallory().email })
    // Workspace capabilities are never stored on a grant.
    expect(guest.capabilities).toEqual([
      "project:read",
      "task:read",
      "task:comment",
    ])
    const token = tokenOf(sent.at(-1)!)
    // Only a hash of the link token is stored.
    expect(
      await prisma.projectGuest.count({ where: { tokenHash: token } })
    ).toBe(0)

    await expect(
      rejectionOf(
        guests.invite(fixture.ctxAlice, {
          projectId: fixture.projectA,
          email: mallory().email,
          expiresInDays: 7,
          capabilities: [],
        })
      )
    ).resolves.toMatchObject({ code: "guest_already_invited" })

    await expect(
      rejectionOf(guests.accept(bob(), token))
    ).resolves.toMatchObject({ code: "guest_email_mismatch" })
    const grantId = await guests.accept(mallory(), token)
    await expect(
      rejectionOf(guests.accept(mallory(), token))
    ).resolves.toMatchObject({ code: "guest_invitation_closed" })

    const ctx = await guests.resolve(mallory(), grantId)
    expect(ctx).toMatchObject({
      organizationId: fixture.orgA,
      projectId: fixture.projectA,
    })
    // Someone else holding the grant id gets nothing.
    expect(await guests.resolve(bob(), grantId)).toBeNull()

    // No seat, no member row: every workspace gate still refuses Mallory.
    expect(
      await prisma.member.count({ where: { organizationId: fixture.orgA } })
    ).toBe(members)
    expect(
      await prisma.member.findFirst({
        where: { organizationId: fixture.orgA, userId: fixture.users.mallory },
      })
    ).toBeNull()
    expect(await guests.listForUser(fixture.users.mallory)).toHaveLength(1)

    const accepted = audits.find(
      (entry) => entry.input.action === "project.guest.accepted"
    )
    expect(accepted?.organizationId).toBe(fixture.orgA)
    expect(accepted?.input.after).toMatchObject({
      guestOrganizations: ["Contract B"],
    })
  })

  it("ends access on expiry, plan downgrade and revocation", async () => {
    const guests = service()
    const [grant] = await prisma.projectGuest.findMany({
      where: { organizationId: fixture.orgA, status: "active" },
    })
    expect(await guests.resolve(mallory(), grant!.id)).not.toBeNull()

    clock = new Date(grant!.expiresAt.getTime() + 1)
    expect(await guests.resolve(mallory(), grant!.id)).toBeNull()
    expect((await guests.list(fixture.ctxAlice))[0]?.state).toBe("expired")
    clock = new Date()

    limit = 0
    expect(await guests.resolve(mallory(), grant!.id)).toBeNull()
    limit = 5

    await guests.revoke(fixture.ctxAlice, grant!.id)
    expect(await guests.resolve(mallory(), grant!.id)).toBeNull()
    expect(await guests.listForUser(fixture.users.mallory)).toHaveLength(0)
    // Another organization cannot see or revoke organization A's grants.
    await expect(
      rejectionOf(guests.revoke(fixture.ctxMallory, grant!.id))
    ).resolves.toMatchObject({ code: "not_found" })

    expect(audits.map((entry) => entry.input.action)).toEqual(
      expect.arrayContaining([
        "project.guest.invited",
        "project.guest.accepted",
        "project.guest.revoked",
      ])
    )
  })

  it("never lets a guest context reach a workspace operation", () => {
    const guest = delegatedGuestContext({
      grantId: "grant_1",
      userId: "user_guest",
      userName: "Guest",
      userEmail: "guest@partner.test",
      organizationId: "org_host",
      projectId: "project_1",
      capabilities: ["project:read"],
    })
    expect(guest.roles).toEqual(["client"])
    for (const operation of DOMAIN_OPERATIONS) {
      expect(guestContextAllowed(operation, guest), operation).toBe(
        isGuestOperation(operation)
      )
      expect(guestContextAllowed(operation, { guest: null }), operation).toBe(
        !isGuestOperation(operation)
      )
    }
  })
})
