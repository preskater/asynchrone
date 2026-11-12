import { z } from "zod"

import { internalAudience, type AppKey } from "../apps"
import {
  DomainMutationResultSchema,
  PortalDocumentLinkSchema,
  PortalDocumentSchema,
  PortalMeetingsSchema,
  PortalProjectDetailSchema,
  PortalProjectSummarySchema,
  PortalReleaseReportSchema,
  PortalReleaseSummarySchema,
  PortalTaskDetailSchema,
  ProjectMessageSchema,
  TaskCommentSchema,
  isDomainOperation,
  type DelegatedContext,
  type DomainOperation,
} from "../internal/domain"
import { InternalErrorSchema, SERVICE_SCOPES } from "../internal/contracts"

/**
 * Typed client for one domain app's delegated internal API.
 *
 * The caller supplies a service-token getter, so this package stays free of
 * `@workspace/service-auth`. Reads retry transient failures; writes retry only
 * when the caller supplies an idempotency key, which the target app uses to
 * return the original result instead of running the mutation twice.
 */

export interface DomainClientOptions {
  /** Target app key (`projects`, `calendars`, …). */
  app: AppKey
  /** Target app origin. */
  baseUrl: string
  getToken: (request: { audience: string; scopes: string[] }) => Promise<string>
  fetchImpl?: typeof fetch
  timeoutMs?: number
  readRetries?: number
  writeRetries?: number
  retryDelayMs?: number
}

export class DomainClientError extends Error {
  readonly status: number
  readonly code: string
  readonly retryable: boolean

  constructor(
    code: string,
    message: string,
    status: number,
    options: { retryable?: boolean } = {}
  ) {
    super(message)
    this.name = "DomainClientError"
    this.code = code
    this.status = status
    this.retryable = options.retryable ?? false
  }
}

export interface DomainCallOptions {
  signal?: AbortSignal
  /** Required for retrying a mutation without duplicating it. */
  idempotencyKey?: string
  /**
   * Correlation id of the inbound request. Forwarded as `x-request-id` so the
   * target app's logs and metrics share one id with the caller (issue #170).
   */
  correlationId?: string | null
  /**
   * Sent as `User-Agent`, so the target app's audit rows name the real client,
   * e.g. the personal access token behind an `/api/v1` call (ADR 0042).
   */
  userAgent?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class DomainClient {
  private readonly options: Required<
    Pick<
      DomainClientOptions,
      | "fetchImpl"
      | "timeoutMs"
      | "readRetries"
      | "writeRetries"
      | "retryDelayMs"
    >
  > &
    DomainClientOptions
  private readonly audience: string

  constructor(options: DomainClientOptions) {
    this.options = {
      fetchImpl: fetch,
      timeoutMs: 5_000,
      readRetries: 2,
      writeRetries: 1,
      retryDelayMs: 100,
      ...options,
    }
    this.audience = internalAudience(options.app)
  }

  private async post<T>(
    operation: DomainOperation,
    context: DelegatedContext,
    input: unknown,
    schema: z.ZodType<T>,
    options: DomainCallOptions
  ): Promise<T> {
    if (!isDomainOperation(operation)) {
      throw new DomainClientError(
        "unknown_operation",
        `Unknown domain operation: ${operation}`,
        400
      )
    }

    const isWrite =
      operation.startsWith("create-") ||
      operation.startsWith("save-") ||
      operation.startsWith("link-") ||
      operation.startsWith("unlink-") ||
      operation.startsWith("set-") ||
      operation.startsWith("move-") ||
      operation.startsWith("rename-") ||
      operation.startsWith("trash-") ||
      operation.startsWith("send-") ||
      operation.startsWith("decide-") ||
      operation.startsWith("respond-") ||
      operation.startsWith("accept-") ||
      operation.startsWith("decline-") ||
      operation.startsWith("update-") ||
      operation.startsWith("portal-create-")
    const attempts = isWrite
      ? options.idempotencyKey
        ? this.options.writeRetries
        : 0
      : this.options.readRetries

    let lastError: unknown
    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      try {
        return await this.send(operation, context, input, schema, options)
      } catch (error) {
        lastError = error
        const retryable =
          error instanceof DomainClientError
            ? error.retryable
            : error instanceof Error && error.name === "AbortError"
        if (!retryable || attempt === attempts) break
        await sleep(this.options.retryDelayMs * (attempt + 1))
      }
    }
    if (lastError instanceof DomainClientError) throw lastError
    throw new DomainClientError(
      "domain_unavailable",
      lastError instanceof Error
        ? lastError.message
        : "The domain app is unavailable",
      503,
      { retryable: true }
    )
  }

  private async send<T>(
    operation: DomainOperation,
    context: DelegatedContext,
    input: unknown,
    schema: z.ZodType<T>,
    options: DomainCallOptions
  ): Promise<T> {
    const token = await this.options.getToken({
      audience: this.audience,
      scopes: [
        operation.startsWith("create-") ||
        operation.startsWith("save-") ||
        operation.startsWith("link-") ||
        operation.startsWith("unlink-") ||
        operation.startsWith("set-") ||
        operation.startsWith("move-") ||
        operation.startsWith("rename-") ||
        operation.startsWith("trash-") ||
        operation.startsWith("send-") ||
        operation.startsWith("decide-") ||
        operation.startsWith("respond-") ||
        operation.startsWith("accept-") ||
        operation.startsWith("decline-") ||
        operation.startsWith("update-") ||
        operation.startsWith("portal-create-")
          ? SERVICE_SCOPES.domainWrite
          : SERVICE_SCOPES.domainRead,
      ],
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs)
    const abort = () => controller.abort()
    options.signal?.addEventListener("abort", abort, { once: true })

    let response: Response
    try {
      response = await this.options.fetchImpl(
        new URL(`/internal/v1/domain/${operation}`, this.options.baseUrl),
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.idempotencyKey
              ? { "Idempotency-Key": options.idempotencyKey }
              : {}),
            ...(options.correlationId
              ? { "x-request-id": options.correlationId }
              : {}),
            ...(options.userAgent ? { "User-Agent": options.userAgent } : {}),
          },
          body: JSON.stringify({ context, input }),
          cache: "no-store",
          signal: controller.signal,
        }
      )
    } catch (error) {
      throw new DomainClientError(
        "domain_unavailable",
        error instanceof Error
          ? error.message
          : "The domain app is unavailable",
        503,
        { retryable: true }
      )
    } finally {
      clearTimeout(timeout)
      options.signal?.removeEventListener("abort", abort)
    }

    const body = (await response.json().catch(() => null)) as unknown
    if (!response.ok) {
      const parsed = InternalErrorSchema.safeParse(
        typeof body === "object" && body && "error" in body
          ? (body as { error: unknown }).error
          : body
      )
      throw new DomainClientError(
        parsed.success ? parsed.data.code : "domain_request_failed",
        parsed.success
          ? parsed.data.message
          : `Domain API returned ${response.status}`,
        response.status,
        { retryable: response.status >= 500 || response.status === 429 }
      )
    }
    if (!body || typeof body !== "object" || !("data" in body)) {
      throw new DomainClientError(
        "invalid_response",
        "Domain API response has no data",
        502
      )
    }
    return schema.parse((body as { data: unknown }).data)
  }

  call<T>(
    operation: DomainOperation,
    context: DelegatedContext,
    input: unknown,
    schema: z.ZodType<T>,
    options: DomainCallOptions = {}
  ): Promise<T> {
    return this.post(operation, context, input, schema, options)
  }

  // -------------------------------------------------------------------------
  // Portal read models (the target app enforces client visibility)
  // -------------------------------------------------------------------------

  listPortalProjects(
    context: DelegatedContext,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof PortalProjectSummarySchema>[]> {
    return this.post(
      "portal-list-projects",
      context,
      { clientId: context.portal?.clientId },
      PortalProjectSummarySchema.array(),
      options ?? {}
    )
  }

  listPortalUnreadMessages(
    context: DelegatedContext,
    projectIds: string[],
    since: string | null,
    options?: DomainCallOptions
  ): Promise<{ projectId: string }[]> {
    return this.post(
      "portal-list-unread-messages",
      context,
      { projectIds, since },
      z.object({ projectId: z.string() }).array(),
      options ?? {}
    )
  }

  getPortalProject(
    context: DelegatedContext,
    projectId: string,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof PortalProjectDetailSchema> | null> {
    return this.post(
      "portal-get-project",
      context,
      { projectId },
      PortalProjectDetailSchema.nullable(),
      options ?? {}
    )
  }

  getPortalTask(
    context: DelegatedContext,
    projectId: string,
    taskId: string,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof PortalTaskDetailSchema> | null> {
    return this.post(
      "portal-get-task",
      context,
      { projectId, taskId },
      PortalTaskDetailSchema.nullable(),
      options ?? {}
    )
  }

  listPortalMessages(
    context: DelegatedContext,
    projectId: string,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof ProjectMessageSchema>[]> {
    return this.post(
      "portal-list-messages",
      context,
      { projectId },
      ProjectMessageSchema.array(),
      options ?? {}
    )
  }

  createPortalMessage(
    context: DelegatedContext,
    projectId: string,
    body: string,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof ProjectMessageSchema>> {
    return this.post(
      "portal-create-message",
      context,
      { projectId, body },
      ProjectMessageSchema,
      options ?? {}
    )
  }

  listPortalTaskComments(
    context: DelegatedContext,
    taskId: string,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof TaskCommentSchema>[]> {
    return this.post(
      "portal-list-task-comments",
      context,
      { taskId },
      TaskCommentSchema.array(),
      options ?? {}
    )
  }

  createPortalTaskComment(
    context: DelegatedContext,
    taskId: string,
    body: string,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof TaskCommentSchema>> {
    return this.post(
      "portal-create-task-comment",
      context,
      { taskId, body },
      TaskCommentSchema,
      options ?? {}
    )
  }

  getPortalMeetings(
    context: DelegatedContext,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof PortalMeetingsSchema>> {
    return this.post(
      "portal-get-meetings",
      context,
      {},
      PortalMeetingsSchema,
      options ?? {}
    )
  }

  listPortalDocuments(
    context: DelegatedContext,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof PortalDocumentSchema>[]> {
    return this.post(
      "portal-list-documents",
      context,
      {},
      PortalDocumentSchema.array(),
      options ?? {}
    )
  }

  listPortalReleaseReports(
    context: DelegatedContext,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof PortalReleaseSummarySchema>[]> {
    return this.post(
      "portal-list-release-reports",
      context,
      {},
      PortalReleaseSummarySchema.array(),
      options ?? {}
    )
  }

  getPortalReleaseReport(
    context: DelegatedContext,
    releaseId: string,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof PortalReleaseReportSchema> | null> {
    return this.post(
      "portal-get-release-report",
      context,
      { releaseId },
      PortalReleaseReportSchema.nullable(),
      options ?? {}
    )
  }

  getPortalDocument(
    context: DelegatedContext,
    fileId: string,
    options?: DomainCallOptions
  ): Promise<z.infer<typeof PortalDocumentLinkSchema> | null> {
    return this.post(
      "portal-get-document",
      context,
      { fileId },
      PortalDocumentLinkSchema.nullable(),
      options ?? {}
    )
  }

  createPortalDocument(
    context: DelegatedContext,
    input: { fileId: string; name: string; sizeBytes: number },
    options?: DomainCallOptions
  ): Promise<{ id: string; createdAt: string }> {
    return this.post(
      "portal-create-document",
      context,
      input,
      z.object({ id: z.string(), createdAt: z.string() }),
      options ?? {}
    )
  }

  getPortalClient(
    context: DelegatedContext,
    options?: DomainCallOptions
  ): Promise<{ id: string; name: string; ownerId: string | null } | null> {
    return this.post(
      "portal-get-client",
      context,
      { clientId: context.portal?.clientId },
      z
        .object({
          id: z.string(),
          name: z.string(),
          ownerId: z.string().nullable(),
        })
        .nullable(),
      options ?? {}
    )
  }

  /** Generic mutation helper used by tests for duplicate detection. */
  get mutationResult() {
    return DomainMutationResultSchema
  }
}
