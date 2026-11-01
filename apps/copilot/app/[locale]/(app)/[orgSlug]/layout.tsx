import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { resolveWorkspace } from "@workspace/app-shell/resolve-workspace"
import { OrganizationSync } from "@/components/organization/organization-sync"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isPortalMember } from "@/lib/portal/context"

export default async function OrganizationLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}>) {
  const { orgSlug } = await params

  const workspace = await resolveWorkspace({
    orgSlug,
    getSession: async () => auth.api.getSession({ headers: await headers() }),
    listOrganizations: async () =>
      auth.api.listOrganizations({ headers: await headers() }),
    isPortalMember,
    endExpiredImpersonation: async (sessionId) => {
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {})
    },
  })

  if (workspace.kind === "redirect") redirect(workspace.to)

  return (
    <>
      {workspace.needsSync ? (
        <OrganizationSync
          needsSync={workspace.needsSync}
          organizationId={workspace.organization.id}
        />
      ) : null}
      {children}
    </>
  )
}
