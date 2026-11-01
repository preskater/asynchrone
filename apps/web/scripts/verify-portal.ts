import "dotenv/config"

import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import type { RequestContext } from "@workspace/core/context"
import type { PortalContext } from "@workspace/portal/types"

import { isPortalMember } from "../lib/core/auth-context"
import { largeObjectStore } from "../lib/large-object"
import { portalService } from "../lib/portal"
import { prisma } from "../lib/prisma"

/**
 * Manual check for the client portal against a live database: client-member
 * scope, cross-organization reads, portal document upload/download and portal
 * access management. Creates throwaway rows, unlinks uploaded bytes and deletes
 * everything before exiting.
 *
 *   npm run verify:portal --workspace=web
 */

let failures = 0

function check(label: string, ok: boolean) {
  if (!ok) failures++
  console.log(`${ok ? "✓" : "✗ FAILED"} ${label}`)
}

async function rejected(work: Promise<unknown>): Promise<boolean> {
  try {
    await work
    return false
  } catch {
    return true
  }
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  await pipeline(stream, async function* (source) {
    for await (const chunk of source) {
      chunks.push(Buffer.from(chunk))
    }
  })
  return Buffer.concat(chunks)
}

function portalContext(
  organization: { id: string; name: string; slug: string },
  client: { id: string; name: string },
  user: { id: string; name: string; email: string }
): PortalContext {
  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    clientId: client.id,
    clientName: client.name,
  }
}

async function main() {
  const suffix = randomUUID().slice(0, 8)
  const orgA = `org_portal_verify_a_${suffix}`
  const orgB = `org_portal_verify_b_${suffix}`
  const portalA = `user_portal_verify_a_${suffix}`
  const portalB = `user_portal_verify_b_${suffix}`
  const admin = `user_portal_verify_admin_${suffix}`

  const users = [
    { id: portalA, name: "Portal A", email: `${portalA}@verify.local` },
    { id: portalB, name: "Portal B", email: `${portalB}@verify.local` },
    { id: admin, name: "Admin", email: `${admin}@verify.local` },
  ]

  try {
    await prisma.user.createMany({ data: users })
    await prisma.organization.createMany({
      data: [
        {
          id: orgA,
          name: `Portal A ${suffix}`,
          slug: orgA,
          createdAt: new Date(),
        },
        {
          id: orgB,
          name: `Portal B ${suffix}`,
          slug: orgB,
          createdAt: new Date(),
        },
      ],
    })
    const clientA = await prisma.client.create({
      data: { organizationId: orgA, name: `Acme ${suffix}` },
    })
    const clientB = await prisma.client.create({
      data: { organizationId: orgB, name: `Globex ${suffix}` },
    })

    await prisma.member.createMany({
      data: [
        {
          id: `member_portal_a_${suffix}`,
          organizationId: orgA,
          userId: portalA,
          role: "client",
          clientId: clientA.id,
          createdAt: new Date(),
        },
        {
          id: `member_portal_b_${suffix}`,
          organizationId: orgB,
          userId: portalB,
          role: "client",
          clientId: clientB.id,
          createdAt: new Date(),
        },
        {
          id: `member_admin_${suffix}`,
          organizationId: orgA,
          userId: admin,
          role: "admin",
          createdAt: new Date(),
        },
      ],
    })

    const projectA = await prisma.project.create({
      data: {
        organizationId: orgA,
        clientId: clientA.id,
        name: "Visible project",
        clientVisible: true,
      },
    })
    await prisma.project.create({
      data: {
        organizationId: orgA,
        clientId: clientA.id,
        name: "Hidden project",
        clientVisible: false,
      },
    })
    const projectB = await prisma.project.create({
      data: {
        organizationId: orgB,
        clientId: clientB.id,
        name: "Other company",
        clientVisible: true,
      },
    })

    const ctxA = portalContext(
      { id: orgA, name: `Portal A ${suffix}`, slug: orgA },
      clientA,
      users[0]!
    )
    const ctxB = portalContext(
      { id: orgB, name: `Portal B ${suffix}`, slug: orgB },
      clientB,
      users[1]!
    )
    const adminCtx: RequestContext = {
      userId: admin,
      userName: "Admin",
      userEmail: `${admin}@verify.local`,
      organizationId: orgA,
      role: "admin",
    }
    const portalActor: RequestContext = {
      userId: portalA,
      userName: "Portal A",
      userEmail: `${portalA}@verify.local`,
      organizationId: orgA,
      role: "client",
    }

    // 1. Only client-linked members are portal users; the workspace stays closed.
    check(
      "client-linked member is a portal user",
      await isPortalMember(orgA, portalA)
    )
    check(
      "internal admin is not a portal user",
      !(await isPortalMember(orgA, admin))
    )

    // 2. The dashboard only lists the caller's company and visible projects.
    const dashboard = await portalService.getDashboard(ctxA)
    check(
      "dashboard only shows visible projects of the caller's company",
      dashboard.projects.length === 1 &&
        dashboard.projects[0]?.id === projectA.id
    )

    // 3. Cross-organization project reads do not leak.
    const ownProject = await portalService
      .getProject(ctxA, projectA.id)
      .catch(() => null)
    check("client reads its own project", ownProject?.id === projectA.id)
    check(
      "client cannot read another organization's project",
      await rejected(portalService.getProject(ctxB, projectA.id))
    )
    check(
      "client cannot read another company's project id",
      await rejected(portalService.getProject(ctxA, projectB.id))
    )

    // 4. Portal accounts never manage portal access.
    check(
      "portal account cannot list portal access",
      await rejected(portalService.listAccess(portalActor, clientA.id))
    )
    const access = await portalService.listAccess(adminCtx, clientA.id)
    check(
      "admin lists the portal member of the company",
      access.members.some((member) => member.userId === portalA)
    )

    // 5. Portal upload creates the file, the client-visible link, the audit row
    //    and the team notification.
    const body = Buffer.from(`portal document ${suffix}`)
    const document = await portalService.uploadDocument(ctxA, {
      name: `brief-${suffix}.txt`,
      mimeType: "text/plain",
      sizeBytes: body.length,
      stream: Readable.from(body),
    })
    const file = await prisma.fileNode.findFirstOrThrow({
      where: { id: document.fileId },
      select: { organizationId: true, oid: true },
    })
    check(
      "portal upload stores the file in the caller's workspace",
      file.organizationId === orgA
    )
    const link = await prisma.clientDocument.findFirst({
      where: {
        organizationId: orgA,
        entity: "client",
        entityId: clientA.id,
        visibility: "client",
        fileId: document.fileId,
      },
    })
    check("portal upload links the file to the client company", Boolean(link))
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: orgA,
        action: "client.document.linked",
        entityId: clientA.id,
      },
    })
    check("portal upload records the audit row", Boolean(audit))
    const notification = await prisma.notification.findFirst({
      where: {
        organizationId: orgA,
        userId: admin,
        type: "portal.document",
      },
    })
    check("portal upload notifies the team admins", Boolean(notification))

    // 6. Download is limited to the client-visible link.
    const opened = await portalService.openDocument(ctxA, document.fileId)
    const downloaded = await readAll(opened.stream)
    check("portal download returns the uploaded bytes", downloaded.equals(body))
    check(
      "another company cannot download the document",
      await rejected(portalService.openDocument(ctxB, document.fileId))
    )
    check(
      "an unlinked file is not downloadable",
      await rejected(portalService.openDocument(ctxA, projectB.id))
    )

    if (file.oid !== null) {
      await largeObjectStore.unlink(Number(file.oid))
    }
  } finally {
    await prisma.organization
      .deleteMany({ where: { id: { in: [orgA, orgB] } } })
      .catch(() => {})
    await prisma.user
      .deleteMany({ where: { id: { in: users.map((user) => user.id) } } })
      .catch(() => {})
    await prisma.$disconnect()
  }

  if (failures > 0) {
    console.error(`\n${failures} portal check(s) failed`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
