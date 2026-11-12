"use server"

import { z } from "zod"

import { ProjectFeedbackReleaseSchema } from "@workspace/contracts"
import { withAction } from "@workspace/core/action"
import { NotFoundError } from "@workspace/core/errors"

import { callDomain, delegatedContext } from "@/lib/internal/domain-client"
import { prisma } from "@/lib/prisma"
import { getRequestContext } from "@/lib/request-context"

/** Client test feedback on the project's releases, owned by the clients app. */
export const listProjectFeedbackAction = withAction(
  async (projectId: string) => {
    const ctx = await getRequestContext()
    const project = await prisma.project.findFirst({
      where: { id: String(projectId), organizationId: ctx.organizationId },
      select: { id: true },
    })
    if (!project) throw new NotFoundError("Project")
    return callDomain(
      "clients",
      "list-project-feedback",
      delegatedContext(ctx),
      { projectId: project.id },
      z.array(ProjectFeedbackReleaseSchema)
    )
  }
)
