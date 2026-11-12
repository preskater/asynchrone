import type { RequestContext } from "@workspace/core/context"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@workspace/core/errors"
import { parseDateKey, toDateKey } from "../dates"
import type {
  FeedbackAssigneeInput,
  FeedbackFilter,
  FeedbackInput,
  FeedbackStatusInput,
  ReleaseInput,
} from "../schemas"
import {
  CLIENT_FEEDBACK_OPEN_STATUSES,
  type ClientFeedbackData,
  type ClientFeedbackEnvironment,
  type ClientFeedbackStatus,
  type ClientReleaseData,
  type ClientReleaseGroupData,
  type ClientReleaseStatus,
} from "../types"
import type { ClientsRepository } from "../repository"
import { ClientsServiceCore, requireEdit, requireManage, text } from "./core"

/** Registered in `AUDIT_ACTIONS` (`@workspace/audit`) for filters and labels. */
const ACTIONS = {
  releaseCreated: "client.release.created",
  releaseUpdated: "client.release.updated",
  releaseDeleted: "client.release.deleted",
  feedbackCreated: "client.feedback.created",
  feedbackUpdated: "client.feedback.updated",
  feedbackStatusChanged: "client.feedback.status_changed",
  feedbackDeleted: "client.feedback.deleted",
} as const

type ReleaseRow = NonNullable<
  Awaited<ReturnType<ClientsRepository["findRelease"]>>
>
type FeedbackRow = NonNullable<
  Awaited<ReturnType<ClientsRepository["findFeedback"]>>
>
type ReleaseStats = Awaited<
  ReturnType<ClientsRepository["releaseStats"]>
>[number]

/**
 * Client releases and the test feedback recorded against them (ADR 0040).
 * Every audit row points at the company, so creations and status changes also
 * show on its timeline.
 */
export class ClientFeedbackService extends ClientsServiceCore {
  async listReleaseGroups(
    ctx: RequestContext,
    filter: FeedbackFilter = {}
  ): Promise<ClientReleaseGroupData[]> {
    const releases = await this.repo.listReleases(ctx.organizationId, {
      clientId: filter.clientId,
      projectId: filter.projectId,
      id: filter.releaseId,
    })
    const ids = releases.map((row) => row.id)
    const [stats, feedbackRows, nameById] = await Promise.all([
      this.repo.releaseStats(
        ctx.organizationId,
        ids,
        CLIENT_FEEDBACK_OPEN_STATUSES
      ),
      this.repo.listFeedback(ctx.organizationId, ids, {
        contactId: filter.contactId,
        status: filter.status,
        category: filter.category,
        impact: filter.impact,
      }),
      this.memberNameById(ctx.organizationId),
    ])
    const contactNames = await this.contactNameById(
      ctx.organizationId,
      feedbackRows
    )
    const statsById = new Map(stats.map((row) => [row.releaseId, row]))
    const byRelease = new Map<string, ClientFeedbackData[]>()
    for (const row of feedbackRows) {
      const list = byRelease.get(row.releaseId) ?? []
      list.push(this.mapFeedback(row, nameById, contactNames))
      byRelease.set(row.releaseId, list)
    }
    return releases.map((row) => ({
      release: this.mapRelease(row, statsById.get(row.id)),
      feedback: byRelease.get(row.id) ?? [],
    }))
  }

  async saveRelease(
    ctx: RequestContext,
    input: ReleaseInput
  ): Promise<ClientReleaseData> {
    requireEdit(this.accessFor(ctx))
    const existing = input.id
      ? await this.repo.findRelease(ctx.organizationId, input.id)
      : null
    if (input.id && !existing) throw new NotFoundError("Release")
    // A release never moves to another company: its feedback belongs there.
    const clientId = existing?.clientId ?? input.clientId
    if (
      !existing &&
      !(await this.repo.findClient(ctx.organizationId, clientId))
    ) {
      throw new NotFoundError("Client")
    }
    const projectId = input.projectId ?? null
    if (projectId) await this.requireClientProject(ctx, clientId, projectId)

    const duplicate = await this.repo.findReleaseByVersion(
      ctx.organizationId,
      clientId,
      input.version
    )
    if (duplicate && duplicate.id !== existing?.id) {
      throw new ConflictError("This version already exists for this client.", {
        code: "release_version_taken",
      })
    }

    const data = {
      projectId,
      version: input.version,
      label: input.label ?? null,
      releasedAt: input.releasedAt ? parseDateKey(input.releasedAt) : null,
      status: input.status,
      notes: input.notes ?? null,
      portalVisible: input.portalVisible,
    }
    const row = existing
      ? await this.repo.updateRelease(existing.id, data)
      : await this.repo.createRelease({
          ...data,
          organizationId: ctx.organizationId,
          clientId,
          createdBy: ctx.userId,
        })
    await this.audit(
      ctx,
      clientId,
      existing ? ACTIONS.releaseUpdated : ACTIONS.releaseCreated,
      { version: row.version, status: row.status },
      existing ? { version: existing.version, status: existing.status } : null
    )
    const [stats] = await this.repo.releaseStats(
      ctx.organizationId,
      [row.id],
      CLIENT_FEEDBACK_OPEN_STATUSES
    )
    return this.mapRelease(row, stats)
  }

  /** Deletes the release and every report on it, so admins only. */
  async deleteRelease(
    ctx: RequestContext,
    id: string
  ): Promise<{ id: string }> {
    requireManage(this.accessFor(ctx))
    const row = await this.repo.findRelease(ctx.organizationId, id)
    if (!row) throw new NotFoundError("Release")
    await this.repo.deleteRelease(id)
    await this.audit(ctx, row.clientId, ACTIONS.releaseDeleted, {
      version: row.version,
    })
    return { id }
  }

  async saveFeedback(
    ctx: RequestContext,
    input: FeedbackInput
  ): Promise<ClientFeedbackData> {
    requireEdit(this.accessFor(ctx))
    const existing = input.id
      ? await this.repo.findFeedback(ctx.organizationId, input.id)
      : null
    if (input.id && !existing) throw new NotFoundError("Feedback")
    const release = await this.repo.findRelease(
      ctx.organizationId,
      input.releaseId
    )
    if (!release) throw new NotFoundError("Release")
    if (existing && existing.clientId !== release.clientId) {
      throw new ValidationError("Feedback cannot move to another client.")
    }

    const contactId = input.contactId ?? null
    if (
      contactId &&
      !(await this.repo.findContact(ctx.organizationId, contactId))
    ) {
      throw new NotFoundError("Contact")
    }
    const assigneeId = input.assigneeId ?? null
    if (assigneeId) await this.requireTeamMember(ctx, assigneeId)
    const documentId = input.documentId ?? null
    if (documentId && documentId !== existing?.documentId) {
      const file = await this.repo.findFileForLink(ctx, documentId)
      if (!file || file.trashed) throw new NotFoundError("File")
    }

    const data = {
      releaseId: release.id,
      projectId: release.projectId,
      // The snapshot only follows the release when the report moves to another one.
      version:
        existing && existing.releaseId === release.id
          ? existing.version
          : release.version,
      contactId,
      assigneeId,
      testedAt: new Date(input.testedAt),
      environment: input.environment,
      category: input.category,
      impact: input.impact,
      title: input.title,
      body: input.body,
      documentId,
    }
    const row = existing
      ? await this.repo.updateFeedback(existing.id, data)
      : await this.repo.createFeedback({
          ...data,
          organizationId: ctx.organizationId,
          clientId: release.clientId,
          authorId: ctx.userId,
        })
    await this.audit(
      ctx,
      row.clientId,
      existing ? ACTIONS.feedbackUpdated : ACTIONS.feedbackCreated,
      { title: row.title, version: row.version }
    )
    return this.toFeedbackData(ctx, row)
  }

  async setFeedbackStatus(
    ctx: RequestContext,
    input: FeedbackStatusInput
  ): Promise<ClientFeedbackData> {
    requireEdit(this.accessFor(ctx))
    const row = await this.repo.findFeedback(ctx.organizationId, input.id)
    if (!row) throw new NotFoundError("Feedback")
    if (row.status === input.status) return this.toFeedbackData(ctx, row)
    const updated = await this.repo.updateFeedback(row.id, {
      status: input.status,
      statusChangedAt: new Date(),
    })
    await this.audit(
      ctx,
      row.clientId,
      ACTIONS.feedbackStatusChanged,
      { title: row.title, version: row.version, status: input.status },
      { status: row.status }
    )
    return this.toFeedbackData(ctx, updated)
  }

  async assignFeedback(
    ctx: RequestContext,
    input: FeedbackAssigneeInput
  ): Promise<ClientFeedbackData> {
    requireEdit(this.accessFor(ctx))
    const row = await this.repo.findFeedback(ctx.organizationId, input.id)
    if (!row) throw new NotFoundError("Feedback")
    if (input.assigneeId) await this.requireTeamMember(ctx, input.assigneeId)
    const updated = await this.repo.updateFeedback(row.id, {
      assigneeId: input.assigneeId,
    })
    await this.audit(
      ctx,
      row.clientId,
      ACTIONS.feedbackUpdated,
      { title: row.title, version: row.version, assigneeId: input.assigneeId },
      { assigneeId: row.assigneeId }
    )
    return this.toFeedbackData(ctx, updated)
  }

  async deleteFeedback(
    ctx: RequestContext,
    id: string
  ): Promise<{ id: string }> {
    requireManage(this.accessFor(ctx))
    const row = await this.repo.findFeedback(ctx.organizationId, id)
    if (!row) throw new NotFoundError("Feedback")
    await this.repo.deleteFeedback(id)
    await this.audit(ctx, row.clientId, ACTIONS.feedbackDeleted, {
      title: row.title,
      version: row.version,
    })
    return { id }
  }

  // --- Helpers ---------------------------------------------------------------

  private async requireClientProject(
    ctx: RequestContext,
    clientId: string,
    projectId: string
  ) {
    const project = await this.repo.findProject(ctx, projectId)
    if (!project) throw new NotFoundError("Project")
    if (project.clientId !== clientId) {
      throw new ValidationError(
        "Link the project to this client first.",
        undefined,
        { code: "project_not_linked_to_client" }
      )
    }
  }

  /** Portal accounts are members too; only the internal team can own a report. */
  private async requireTeamMember(ctx: RequestContext, userId: string) {
    const member = await this.repo.memberExists(ctx.organizationId, userId)
    if (!member || member.clientId != null) throw new NotFoundError("Member")
  }

  private audit(
    ctx: RequestContext,
    clientId: string,
    action: string,
    after: Record<string, unknown>,
    before: Record<string, unknown> | null = null
  ) {
    return this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action,
        entityType: "client",
        entityId: clientId,
        before: before ?? undefined,
        after,
      },
    ])
  }

  private async contactNameById(organizationId: string, rows: FeedbackRow[]) {
    const ids = [
      ...new Set(rows.flatMap((row) => (row.contactId ? [row.contactId] : []))),
    ]
    const contacts = await this.repo.contactNames(organizationId, ids)
    return new Map(
      contacts.map((row) => [row.id, `${row.firstName} ${row.lastName}`.trim()])
    )
  }

  private async toFeedbackData(
    ctx: RequestContext,
    row: FeedbackRow
  ): Promise<ClientFeedbackData> {
    const [nameById, contactNames] = await Promise.all([
      this.memberNameById(ctx.organizationId),
      this.contactNameById(ctx.organizationId, [row]),
    ])
    return this.mapFeedback(row, nameById, contactNames)
  }

  private mapRelease(row: ReleaseRow, stats?: ReleaseStats): ClientReleaseData {
    return {
      id: row.id,
      clientId: row.clientId,
      projectId: text(row.projectId),
      version: row.version,
      label: text(row.label),
      releasedAt: row.releasedAt ? toDateKey(row.releasedAt) : undefined,
      status: row.status as ClientReleaseStatus,
      notes: text(row.notes),
      portalVisible: row.portalVisible,
      testedFrom: stats?.testedFrom?.toISOString(),
      testedTo: stats?.testedTo?.toISOString(),
      feedbackCount: stats?.count ?? 0,
      openCount: stats?.open ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private mapFeedback(
    row: FeedbackRow,
    nameById: Map<string, string>,
    contactNames: Map<string, string>
  ): ClientFeedbackData {
    return {
      id: row.id,
      clientId: row.clientId,
      releaseId: row.releaseId,
      projectId: text(row.projectId),
      version: row.version,
      contactId: text(row.contactId),
      contactName: row.contactId ? contactNames.get(row.contactId) : undefined,
      authorId: row.authorId,
      authorName: nameById.get(row.authorId) ?? "—",
      assigneeId: text(row.assigneeId),
      assigneeName: row.assigneeId ? nameById.get(row.assigneeId) : undefined,
      testedAt: row.testedAt.toISOString(),
      environment: row.environment as ClientFeedbackEnvironment,
      category: row.category,
      impact: row.impact,
      status: row.status as ClientFeedbackStatus,
      statusChangedAt: row.statusChangedAt.toISOString(),
      title: row.title,
      body: row.body,
      linkedTaskId: text(row.linkedTaskId),
      documentId: text(row.documentId),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
