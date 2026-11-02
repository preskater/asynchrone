import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { RequestContext } from "@workspace/core/context"
import {
  canMarkExportReady,
  createOrganizationDeletionHandler,
  createOrganizationExportHandler,
} from "@workspace/sagas"

import {
  deleteOrganization,
  requestOrganizationDeletion,
} from "@/lib/organization/deletion-service"
import { listExports, requestExport } from "@/lib/organization/export-service"
import { prisma } from "@/lib/prisma"

const DAY = 24 * 60 * 60 * 1000

function context(
  userId: string,
  organizationId: string,
  role: RequestContext["role"]
): RequestContext {
  return {
    userId,
    userName: userId,
    userEmail: `${userId}@contract.local`,
    organizationId,
    role,
  }
}

describe("organization export and deletion contracts", () => {
  const suffix = randomUUID().slice(0, 8)
  const orgId = `org_contract_export_${suffix}`
  const otherOrgId = `org_contract_other_${suffix}`
  const owner = `user_contract_export_owner_${suffix}`
  const member = `user_contract_export_member_${suffix}`
  const ctxOwner = context(owner, orgId, "owner")
  const ctxMember = context(member, orgId, "member")
  const ctxOther = context(owner, otherOrgId, "owner")

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [owner, member].map((id) => ({
        id,
        name: id,
        email: `${id}@contract.local`,
      })),
    })
    await prisma.organization.createMany({
      data: [
        {
          id: orgId,
          name: `Export ${suffix}`,
          slug: `export-${suffix}`,
          createdAt: new Date(),
        },
        {
          id: otherOrgId,
          name: `Other ${suffix}`,
          slug: `other-${suffix}`,
          createdAt: new Date(),
        },
      ],
    })
    await prisma.member.createMany({
      data: [
        {
          id: `member_export_owner_${suffix}`,
          organizationId: orgId,
          userId: owner,
          role: "owner",
          createdAt: new Date(),
        },
        {
          id: `member_export_member_${suffix}`,
          organizationId: orgId,
          userId: member,
          role: "member",
          createdAt: new Date(),
        },
        {
          id: `member_other_owner_${suffix}`,
          organizationId: otherOrgId,
          userId: owner,
          role: "owner",
          createdAt: new Date(),
        },
      ],
    })
  })

  afterAll(async () => {
    await prisma.organization
      .deleteMany({ where: { id: { in: [orgId, otherOrgId] } } })
      .catch(() => {})
    await prisma.user
      .deleteMany({ where: { id: { in: [owner, member] } } })
      .catch(() => {})
  })

  it("lets only an owner request an export, once at a time", async () => {
    await expect(requestExport(ctxMember)).rejects.toMatchObject({
      code: "forbidden",
    })

    const exportJob = await requestExport(ctxOwner)
    expect(exportJob.id).toBeTruthy()

    await expect(requestExport(ctxOwner)).rejects.toMatchObject({
      code: "export_in_progress",
    })

    const own = await listExports(orgId)
    const other = await listExports(otherOrgId)
    expect(own.map((entry) => entry.id)).toContain(exportJob.id)
    expect(other).toEqual([])
  })

  it("only deletes an organization whose grace period has passed", async () => {
    await expect(deleteOrganization(orgId, new Date())).resolves.toBe(false)
    expect(
      await prisma.organization.count({
        where: { id: { in: [orgId, otherOrgId] } },
      })
    ).toBe(2)

    await prisma.organization.update({
      where: { id: orgId },
      data: { deletionScheduledAt: new Date(Date.now() - DAY) },
    })
    await expect(deleteOrganization(otherOrgId, new Date())).resolves.toBe(
      false
    )

    await expect(deleteOrganization(orgId, new Date())).resolves.toBe(true)
    expect(
      await prisma.organization.findUnique({ where: { id: orgId } })
    ).toBeNull()
    expect(
      await prisma.organization.findUnique({ where: { id: otherOrgId } })
    ).not.toBeNull()
  })

  it("requires the owner and the exact organization name to schedule deletion", async () => {
    await expect(
      requestOrganizationDeletion(ctxMember, `Other ${suffix}`)
    ).rejects.toMatchObject({ code: "forbidden" })

    await expect(
      requestOrganizationDeletion(ctxOther, "wrong name")
    ).rejects.toMatchObject({ code: "validation_error" })

    const scheduled = await requestOrganizationDeletion(
      ctxOther,
      `Other ${suffix}`
    )
    expect(scheduled.deletionScheduledAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe("export/deletion HTTP contracts", () => {
  it("never marks an export ready while a part is missing or failed", () => {
    expect(canMarkExportReady([], 1)).toBe(false)
    expect(canMarkExportReady([{ status: "complete" }], 2)).toBe(false)
    expect(
      canMarkExportReady([{ status: "complete" }, { status: "failed" }], 2)
    ).toBe(false)
    expect(
      canMarkExportReady([{ status: "complete" }, { status: "complete" }], 2)
    ).toBe(true)
  })

  it("rejects an unauthenticated saga call before touching the domain", async () => {
    let called = false
    const DELETE = createOrganizationDeletionHandler({
      app: "projects",
      authorizeDelete: async () => {
        throw Object.assign(new Error("no"), {
          status: 403,
          code: "insufficient_scope",
          message: "No delete scope",
        })
      },
      authorizeExport: async () => undefined,
      deleteOrganization: async (organizationId) => {
        called = true
        return {
          app: "projects",
          organizationId,
          deleted: {},
          completedAt: new Date(),
        }
      },
      deleteUser: async (userId) => ({
        app: "projects",
        organizationId: "org_1",
        userId,
        deleted: {},
        completedAt: new Date(),
      }),
      exportOrganization: async () => {
        throw new Error("unused")
      },
    })

    const response = await DELETE(
      new Request(
        "https://projects.example/internal/v1/organizations/org_1?organizationId=org_1",
        { method: "DELETE" }
      )
    )
    expect(response.status).toBe(403)
    expect(called).toBe(false)
  })

  it("serves an export part only after authorization", async () => {
    const GET = createOrganizationExportHandler({
      app: "projects",
      authorizeDelete: async () => undefined,
      authorizeExport: async () => undefined,
      deleteOrganization: async () => ({
        app: "projects",
        organizationId: "org_1",
        deleted: {},
        completedAt: new Date(),
      }),
      deleteUser: async (userId) => ({
        app: "projects",
        organizationId: "org_1",
        userId,
        deleted: {},
        completedAt: new Date(),
      }),
      exportOrganization: async (organizationId) => ({
        manifest: {
          app: "projects",
          appVersion: "1.0.0",
          schemaVersion: "2026-11-01",
          generatedAt: new Date(),
          tables: { project: 1 },
        },
        data: { project: [{ id: organizationId }] },
      }),
    })

    const response = await GET(
      new Request(
        "https://projects.example/internal/v1/organizations/org_1/export?organizationId=org_1"
      )
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.data.project[0].id).toBe("org_1")
  })
})
