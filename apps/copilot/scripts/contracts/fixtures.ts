import { randomUUID } from "node:crypto"

import type { RequestContext } from "@workspace/core/context"

import { prisma } from "@/lib/prisma"

/**
 * Identity-only contract fixture.
 *
 * Domain rows live in their own databases now; a Copilot contract test must not
 * seed another app's tables. Tests that need a project, client or file exercise
 * the owning app's own suite instead. The opaque ids below are only used in
 * assistant output payloads.
 */
export interface ContractFixture {
  suffix: string
  orgA: string
  orgB: string
  slugA: string
  slugB: string
  users: {
    alice: string
    bob: string
    mallory: string
    portalB: string
  }
  ctxAlice: RequestContext
  ctxBob: RequestContext
  ctxMallory: RequestContext
  projectA: string
  notificationA: string
  cleanup: () => Promise<void>
}

export async function createContractFixture(): Promise<ContractFixture> {
  const suffix = randomUUID().slice(0, 8)
  const now = new Date()
  const orgA = `org_contract_a_${suffix}`
  const orgB = `org_contract_b_${suffix}`
  const slugA = `contract-a-${suffix}`
  const slugB = `contract-b-${suffix}`
  const users = {
    alice: `user_contract_alice_${suffix}`,
    bob: `user_contract_bob_${suffix}`,
    mallory: `user_contract_mallory_${suffix}`,
    portalB: `user_contract_portal_b_${suffix}`,
  }

  await prisma.organization.createMany({
    data: [
      { id: orgA, name: "Contract A", slug: slugA, createdAt: now },
      { id: orgB, name: "Contract B", slug: slugB, createdAt: now },
    ],
  })
  await prisma.user.createMany({
    data: Object.entries(users).map(([key, id]) => ({
      id,
      name: key[0]!.toUpperCase() + key.slice(1),
      email: `${id}@contract.local`,
    })),
  })
  await prisma.member.createMany({
    data: [
      {
        id: `member_alice_${suffix}`,
        organizationId: orgA,
        userId: users.alice,
        role: "owner",
        createdAt: now,
      },
      {
        id: `member_bob_${suffix}`,
        organizationId: orgA,
        userId: users.bob,
        role: "member",
        createdAt: now,
      },
      {
        id: `member_mallory_${suffix}`,
        organizationId: orgB,
        userId: users.mallory,
        role: "owner",
        createdAt: now,
      },
      {
        id: `member_portal_b_${suffix}`,
        organizationId: orgB,
        userId: users.portalB,
        role: "client",
        clientId: `client_contract_b_${suffix}`,
        createdAt: now,
      },
    ],
  })
  const notification = await prisma.notification.create({
    data: {
      organizationId: orgA,
      userId: users.alice,
      type: "task.assigned",
      data: { title: "Review the spec" },
      createdAt: now,
    },
    select: { id: true },
  })

  const ctx = (
    userId: string,
    userName: string,
    organizationId: string,
    role: string
  ): RequestContext => ({
    userId,
    userName,
    userEmail: `${userId}@contract.local`,
    organizationId,
    role: role as RequestContext["role"],
  })

  return {
    suffix,
    orgA,
    orgB,
    slugA,
    slugB,
    users,
    ctxAlice: ctx(users.alice, "Alice", orgA, "owner"),
    ctxBob: ctx(users.bob, "Bob", orgA, "member"),
    ctxMallory: ctx(users.mallory, "Mallory", orgB, "owner"),
    projectA: `project_contract_a_${suffix}`,
    notificationA: notification.id,
    async cleanup() {
      await prisma.notification
        .deleteMany({ where: { organizationId: { in: [orgA, orgB] } } })
        .catch(() => {})
      await prisma.organization
        .deleteMany({ where: { id: { in: [orgA, orgB] } } })
        .catch(() => {})
      await prisma.user
        .deleteMany({ where: { id: { in: Object.values(users) } } })
        .catch(() => {})
    },
  }
}

/** Turns a rejected promise into the typed error for assertions. */
export async function rejectionOf<T>(promise: Promise<T>): Promise<unknown> {
  try {
    await promise
    throw new Error("Expected the call to be rejected")
  } catch (error) {
    if (error instanceof Error && error.message === "Expected the call to be rejected") {
      throw error
    }
    return error
  }
}
