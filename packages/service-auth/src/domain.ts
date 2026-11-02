import {
  DomainCallSchema,
  INTERNAL_API_VERSION,
  InternalErrorSchema,
  SERVICE_SCOPES,
  domainOperationScope,
  isDomainOperation,
  type DomainCall,
  type DomainOperation,
} from "@workspace/contracts"

import { ServiceAuthError } from "./config"
import { requireInternalService, ServiceTokenVerifier } from "./verify"

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

function envelope(app: string, data: unknown): Response {
  return Response.json(
    {
      data,
      meta: {
        app,
        version: INTERNAL_API_VERSION,
        requestId: crypto.randomUUID(),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    }
  )
}

function error(status: number, code: string, message: string): Response {
  return Response.json(
    { error: InternalErrorSchema.parse({ code, message }) },
    { status, headers: { "Cache-Control": "no-store" } }
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
    const { operation } = await context.params
    if (!isDomainOperation(operation)) {
      return error(404, "not_found", "Unknown domain operation")
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
        return error(cause.status, cause.code, cause.message)
      }
      return error(401, "unauthorized", "A valid service token is required")
    }

    const raw = (await request.json().catch(() => null)) as unknown
    const parsed = DomainCallSchema.safeParse(raw)
    if (!parsed.success) {
      return error(400, "invalid_call", "The domain call envelope is invalid")
    }

    const idempotencyKey =
      domainOperationScope(operation) === "write"
        ? request.headers.get("idempotency-key")
        : null
    const cacheKey = idempotencyKey
      ? `${claims.client_id}|${operation}|${idempotencyKey}`
      : null

    if (cacheKey) {
      const now = Date.now()
      prune(now)
      const cached = idempotent.get(cacheKey)
      if (cached) {
        try {
          return envelope(app, await cached.result)
        } catch (cause) {
          return error(
            statusOf(cause) ?? 500,
            codeOf(cause),
            cause instanceof Error ? cause.message : "Domain request failed"
          )
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
      return envelope(app, await result)
    } catch (cause) {
      if (cacheKey) idempotent.delete(cacheKey)
      const status = statusOf(cause)
      if (status) {
        return error(
          status,
          codeOf(cause),
          cause instanceof Error ? cause.message : "Domain request failed"
        )
      }
      console.error(`[${app}] internal domain request failed`, cause)
      return error(500, "internal_error", "Domain request failed")
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
