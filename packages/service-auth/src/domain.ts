import {
  DomainCallSchema,
  INTERNAL_API_VERSION,
  InternalErrorSchema,
  SERVICE_SCOPES,
  domainOperationScope,
  guestContextAllowed,
  isDomainOperation,
  type DomainCall,
  type DomainOperation,
} from "@workspace/contracts"

import { observeRequest, logRequest } from "@workspace/observability"

import { ServiceAuthError } from "./config"
import { requireInternalService, ServiceTokenVerifier } from "./verify"

/**
 * Correlation id header shared with every app (issue #170). Kept as a literal
 * so `@workspace/service-auth` does not need a browser-visible dependency for
 * one constant.
 */
const CORRELATION_HEADER = "x-request-id"

export interface DomainDispatch {
  (operation: DomainOperation, call: DomainCall): Promise<unknown>
}

export interface DomainHandlerOptions {
  /** This app's key, used in the response metadata. */
  app: string
  /** The verifier, or a factory so imports stay safe at build time. */
  verifier: ServiceTokenVerifier | (() => ServiceTokenVerifier)
  dispatch: DomainDispatch
  /** How long an idempotent result is replayed. */
  idempotencyTtlMs?: number
}

interface IdempotentEntry {
  expiresAt: number
  result: Promise<unknown>
}

function envelope(
  app: string,
  data: unknown,
  correlationId: string | null
): Response {
  return Response.json(
    {
      data,
      meta: {
        app,
        version: INTERNAL_API_VERSION,
        requestId: correlationId ?? crypto.randomUUID(),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        ...(correlationId ? { [CORRELATION_HEADER]: correlationId } : {}),
      },
    }
  )
}

function error(
  status: number,
  code: string,
  message: string,
  correlationId: string | null = null
): Response {
  return Response.json(
    { error: InternalErrorSchema.parse({ code, message }) },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(correlationId ? { [CORRELATION_HEADER]: correlationId } : {}),
      },
    }
  )
}

function statusOf(cause: unknown): number | null {
  if (!cause || typeof cause !== "object") return null
  const status = (cause as { status?: unknown }).status
  return typeof status === "number" && status >= 400 && status <= 599
    ? status
    : null
}

function codeOf(cause: unknown): string {
  if (cause && typeof cause === "object") {
    const code = (cause as { code?: unknown }).code
    if (typeof code === "string" && code.length > 0) return code
  }
  return "internal_error"
}

/**
 * Shared `/internal/v1/domain/:operation` handler.
 *
 * Verifies the client-credentials token, checks that its scope matches the
 * operation, parses the delegated context and dispatches. A mutation retried
 * with the same `Idempotency-Key` returns the first result instead of running
 * again; the cache is per process and bounded by `idempotencyTtlMs`.
 */
export function createDomainHandler({
  app,
  verifier,
  dispatch,
  idempotencyTtlMs = 10 * 60_000,
}: DomainHandlerOptions) {
  const idempotent = new Map<string, IdempotentEntry>()
  const resolveVerifier =
    typeof verifier === "function" ? verifier : () => verifier

  function prune(now: number) {
    for (const [key, entry] of idempotent) {
      if (entry.expiresAt <= now) idempotent.delete(key)
    }
  }

  return async function handleDomainRequest(
    request: Request,
    context: { params: Promise<{ operation: string }> }
  ): Promise<Response> {
    const started = performance.now()
    const correlationId = request.headers.get(CORRELATION_HEADER)
    const { operation } = await context.params
    if (!isDomainOperation(operation)) {
      return error(404, "not_found", "Unknown domain operation", correlationId)
    }

    const scope =
      domainOperationScope(operation) === "write"
        ? SERVICE_SCOPES.domainWrite
        : SERVICE_SCOPES.domainRead

    let claims
    try {
      claims = await requireInternalService(request, resolveVerifier(), {
        requiredScopes: [scope],
      })
    } catch (cause) {
      if (cause instanceof ServiceAuthError) {
        return error(cause.status, cause.code, cause.message, correlationId)
      }
      return error(
        401,
        "unauthorized",
        "A valid service token is required",
        correlationId
      )
    }

    const raw = (await request.json().catch(() => null)) as unknown
    const parsed = DomainCallSchema.safeParse(raw)
    if (!parsed.success) {
      return error(
        400,
        "invalid_call",
        "The domain call envelope is invalid",
        correlationId
      )
    }
    // A guest grant never reaches a workspace operation, in any app.
    if (!guestContextAllowed(operation, parsed.data.context)) {
      return error(
        403,
        "forbidden",
        "This operation does not accept this caller",
        correlationId
      )
    }

    const idempotencyKey =
      domainOperationScope(operation) === "write"
        ? request.headers.get("idempotency-key")
        : null
    const cacheKey = idempotencyKey
      ? `${claims.client_id}|${operation}|${idempotencyKey}`
      : null

    let status = 200
    const record = () => {
      const durationMs = performance.now() - started
      const route = `/internal/v1/domain/${operation}`
      observeRequest({
        app,
        route,
        method: request.method,
        status,
        durationMs,
      })
      logRequest({
        app,
        route,
        method: request.method,
        status,
        durationMs,
        correlationId,
      })
    }

    if (cacheKey) {
      const now = Date.now()
      prune(now)
      const cached = idempotent.get(cacheKey)
      if (cached) {
        try {
          const response = envelope(app, await cached.result, correlationId)
          record()
          return response
        } catch (cause) {
          status = statusOf(cause) ?? 500
          const response = error(
            status,
            codeOf(cause),
            cause instanceof Error ? cause.message : "Domain request failed",
            correlationId
          )
          record()
          return response
        }
      }
    }

    const result = dispatch(operation, parsed.data)
    if (cacheKey) {
      idempotent.set(cacheKey, {
        expiresAt: Date.now() + idempotencyTtlMs,
        result,
      })
    }

    try {
      const response = envelope(app, await result, correlationId)
      record()
      return response
    } catch (cause) {
      if (cacheKey) idempotent.delete(cacheKey)
      const mapped = statusOf(cause)
      if (mapped) {
        status = mapped
        const response = error(
          mapped,
          codeOf(cause),
          cause instanceof Error ? cause.message : "Domain request failed",
          correlationId
        )
        record()
        return response
      }
      console.error(`[${app}] internal domain request failed`, cause)
      status = 500
      const response = error(
        500,
        "internal_error",
        "Domain request failed",
        correlationId
      )
      record()
      return response
    }
  }
}

/** Build the service verifier for a domain app. */
export function domainVerifier(
  audience: string,
  issuer = process.env.COPILOT_APP_URL ?? process.env.BETTER_AUTH_URL
): ServiceTokenVerifier {
  if (!issuer) throw new Error("COPILOT_APP_URL or BETTER_AUTH_URL is required")
  return new ServiceTokenVerifier({ issuer, audience })
}
