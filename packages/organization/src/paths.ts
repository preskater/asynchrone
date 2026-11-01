import { revalidatePath } from "next/cache"

export interface OrganizationSummary {
  id: string
  slug: string
}

export interface OrganizationPathsAuth {
  api: {
    getSession(args: { headers: Headers }): Promise<{
      session: { activeOrganizationId?: string | null }
    } | null>
    listOrganizations(args: {
      headers: Headers
    }): Promise<OrganizationSummary[]>
  }
}

export interface OrganizationPathsDb {
  organization: {
    findUnique(args: {
      where: { id: string }
      select: { slug: true }
    }): PromiseLike<{ slug: string } | null>
  }
}

export function organizationPath(slug: string, path = "") {
  return `/${slug}${path}`
}

/** Build the organization path/revalidation helpers for an app. */
export function createOrganizationPaths({
  auth,
  db,
  getHeaders,
}: {
  auth: OrganizationPathsAuth
  db: OrganizationPathsDb
  getHeaders: () => Promise<Headers>
}) {
  async function getActiveOrgSlug(): Promise<string | null> {
    const requestHeaders = await getHeaders()
    const session = await auth.api.getSession({ headers: requestHeaders })
    if (!session) return null

    const organizations = await auth.api.listOrganizations({
      headers: requestHeaders,
    })
    if (organizations.length === 0) return null

    const sessionOrganizationId = session.session.activeOrganizationId ?? null
    const active =
      organizations.find((org) => org.id === sessionOrganizationId) ??
      organizations[0]

    return active?.slug ?? null
  }

  async function revalidateOrgPath(organizationId: string, path = "") {
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { slug: true },
    })
    if (!organization) return
    revalidatePath(organizationPath(organization.slug, path))
  }

  return { getActiveOrgSlug, revalidateOrgPath }
}
