import { prisma as clientsPrisma } from "@workspace/db-clients"
import { prisma } from "@workspace/db-identity"
import { prisma as projectsPrisma } from "@workspace/db-projects"

async function organizationId(slug: string): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  })
  if (!organization) throw new Error(`Unknown organization: ${slug}`)
  return organization.id
}

/** Create a project directly for an organization and return its id. */
export async function createProject(
  organizationSlug: string,
  name: string
): Promise<string> {
  const id = await organizationId(organizationSlug)
  const owner = await prisma.member.findFirst({
    where: { organizationId: id, role: "owner" },
    select: { userId: true },
  })
  const project = await projectsPrisma.project.create({
    data: {
      organizationId: id,
      name,
      ...(owner ? { members: { create: [{ userId: owner.userId }] } } : {}),
    },
    select: { id: true },
  })
  return project.id
}

/** Create a client company directly for an organization and return its id. */
export async function createClient(
  organizationSlug: string,
  name: string
): Promise<string> {
  const client = await clientsPrisma.client.create({
    data: {
      organizationId: await organizationId(organizationSlug),
      name,
      status: "active",
    },
    select: { id: true },
  })
  return client.id
}
