import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"

import { ProjectWorkspace } from "@workspace/projects/components/project/project-workspace"

import { auth } from "@/lib/auth"
import { getRequestContextForOrganization } from "@/lib/core/auth-context"
import { NotFoundError } from "@workspace/core/errors"
import { prisma } from "@/lib/prisma"
import { projectService } from "@/lib/projects"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; projectId: string }>
}) {
  const { orgSlug, projectId } = await params

  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/sign-in")
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true },
  })

  if (!organization) {
    notFound()
  }

  const ctx = await getRequestContextForOrganization(organization.id)

  try {
    await projectService.get(ctx, projectId)
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound()
    }
    throw error
  }

  return <ProjectWorkspace projectId={projectId} />
}
