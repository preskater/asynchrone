import type {
  DeletionSagaStore,
  SagaAppState,
  SagaAppStatus,
  SagaJobState,
  SagaStatus,
} from "@workspace/sagas"
import { prisma } from "@workspace/db-identity"

import { deleteOrganization } from "@/lib/organization/deletion-service"

const DAY = 24 * 60 * 60 * 1000

function deadline(now: Date): Date {
  return new Date(now.getTime() + 7 * DAY)
}

function appStates(apps: { app: string; status: string }[]): SagaAppState[] {
  return apps.map((app) => ({
    app: app.app,
    status: app.status as SagaAppStatus,
  }))
}

function organizationState(job: {
  id: string
  status: string
  deadlineAt: Date | null
  apps: { app: string; status: string }[]
}): SagaJobState {
  return {
    id: job.id,
    status: job.status,
    deadlineAt: job.deadlineAt,
    apps: appStates(job.apps),
  }
}

function userState(job: {
  id: string
  status: string
  deadlineAt: Date | null
  apps: { app: string; status: string }[]
}): SagaJobState {
  return {
    id: job.id,
    status: job.status,
    deadlineAt: job.deadlineAt,
    apps: appStates(job.apps),
  }
}

/**
 * Identity-database implementation of the deletion saga store. The domain apps
 * never see these tables; they only receive idempotent deletion calls.
 */
export const deletionSagaStore: DeletionSagaStore = {
  async ensureOrganizationJob({ organizationId, apps, requestedById }) {
    const now = new Date()
    const job = await prisma.organizationDeletionJob.upsert({
      where: { organizationId },
      create: {
        organizationId,
        requestedById,
        scheduledAt: now,
        deadlineAt: deadline(now),
        apps: { create: apps.map((app) => ({ app })) },
      },
      update: {},
      select: {
        id: true,
        status: true,
        deadlineAt: true,
        apps: { select: { app: true, status: true } },
      },
    })
    await prisma.organizationDeletionApp.createMany({
      data: apps.map((app) => ({ jobId: job.id, app })),
      skipDuplicates: true,
    })
    return organizationState(job)
  },

  async markOrganizationApp({ jobId, app, status, error }) {
    await prisma.organizationDeletionApp.update({
      where: { jobId_app: { jobId, app } },
      data: {
        status,
        lastError: error ?? null,
        attempts: { increment: status === "running" ? 1 : 0 },
        ...(status === "running" ? { startedAt: new Date() } : {}),
        ...(status === "completed" || status === "skipped"
          ? { completedAt: new Date() }
          : {}),
      },
    })
  },

  async markOrganizationJob({ jobId, status, currentApp, error }) {
    await prisma.organizationDeletionJob.update({
      where: { id: jobId },
      data: {
        status,
        currentApp: currentApp ?? null,
        lastError: error ?? null,
        ...(status === "running" ? { startedAt: new Date() } : {}),
        ...(status === "completed" || status === "failed"
          ? { completedAt: new Date() }
          : {}),
      },
    })
  },

  async deleteOrganizationIdentity(organizationId) {
    const deleted = await deleteOrganization(organizationId)
    if (!deleted) {
      throw new Error("Organization is no longer scheduled for deletion")
    }
  },

  async ensureUserJob({ userId, organizationId, apps }) {
    const now = new Date()
    const job = await prisma.userDeletionJob.upsert({
      where: { userId },
      create: {
        userId,
        organizationId,
        scheduledAt: now,
        deadlineAt: deadline(now),
        apps: { create: apps.map((app) => ({ app })) },
      },
      update: {},
      select: {
        id: true,
        status: true,
        deadlineAt: true,
        apps: { select: { app: true, status: true } },
      },
    })
    await prisma.userDeletionApp.createMany({
      data: apps.map((app) => ({ jobId: job.id, app })),
      skipDuplicates: true,
    })
    return userState(job)
  },

  async markUserApp({ jobId, app, status, error }) {
    await prisma.userDeletionApp.update({
      where: { jobId_app: { jobId, app } },
      data: {
        status,
        lastError: error ?? null,
        attempts: { increment: status === "running" ? 1 : 0 },
        ...(status === "running" ? { startedAt: new Date() } : {}),
        ...(status === "completed" || status === "skipped"
          ? { completedAt: new Date() }
          : {}),
      },
    })
  },

  async markUserJob({ jobId, status, currentApp, error }) {
    await prisma.userDeletionJob.update({
      where: { id: jobId },
      data: {
        status,
        currentApp: currentApp ?? null,
        lastError: error ?? null,
        ...(status === "running" ? { startedAt: new Date() } : {}),
        ...(status === "completed" || status === "failed"
          ? { completedAt: new Date() }
          : {}),
      },
    })
  },

  async deleteUserIdentity(userId) {
    await prisma.user.delete({ where: { id: userId } })
  },
}

export type { SagaStatus }
