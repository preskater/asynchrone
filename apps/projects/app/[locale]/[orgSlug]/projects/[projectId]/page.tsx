import { notFound } from "next/navigation"

import { NotFoundError } from "@workspace/core/errors"
import { ProjectWorkspace } from "@workspace/projects/components/project/project-workspace"

import { getRequestContext } from "@/lib/request-context"
import { projectService } from "@/lib/projects"

/**
 * One project: tasks, labels, members, template fields, the discussion and the
 * repository settings. Authorization is the domain service's (`listTasks` /
 * `get`), so a project id from another organization is a 404.
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const ctx = await getRequestContext()

  try {
    await projectService.get(ctx, projectId)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  return <ProjectWorkspace projectId={projectId} />
}
