import {
  InvalidateResponseSchema,
  InvalidateSchema,
  InternalErrorSchema,
  SERVICE_SCOPES,
  type InvalidateRequest,
} from "@workspace/contracts"

import { logRequest, observeRequest } from "@workspace/observability"

import { ServiceAuthError } from "./config"
import { requireInternalService, type ServiceTokenVerifier } from "./verify"

const CORRELATION_HEADER = "x-request-id"

export interface InvalidationHandlerOptions {
  /** This app's key, echoed in the response. */
  app: string
  /** The service verifier, or a factory so imports stay build-safe. */
  verifier: ServiceTokenVerifier | (() => ServiceTokenVerifier)
  /**
   * Revalidate this app's cached reads. Bind `revalidatePath`/`revalidateTag`
   * in the app; the handler only validates the payload.
   */
  revalidate: (request: InvalidateRequest) => Promise<void> | void
}

function error(
  status: number,
  code: string,
  message: string,
  correlationId: string | null
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

/**
 * `POST /internal/v1/invalidate`: clear this app's cached reads after another
 * app performed a mutation that changes them (issue #170).
 *
 * `revalidatePath` only affects the app that calls it, so a Copilot mutation
 * that changes a domain read model fans out here. The endpoint requires the
 * `internal:cache:write` scope and never touches another tenant: the paths
 * must be absolute and the app revalidates exactly what it is given.
 */
export function createInvalidationHandler({
  app,
  verifier,
  revalidate,
}: InvalidationHandlerOptions) {
  const resolveVerifier =
    typeof verifier === "function" ? verifier : () => verifier

  async function handleInvalidationRequest(
    request: Request
  ): Promise<Response> {
    const correlationId = request.headers.get(CORRELATION_HEADER)
    try {
      await requireInternalService(request, resolveVerifier(), {
        requiredScopes: [SERVICE_SCOPES.cacheWrite],
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
    const parsed = InvalidateSchema.safeParse(raw)
    if (!parsed.success) {
      return error(
        400,
        "invalid_request",
        "The invalidation payload is invalid",
        correlationId
      )
    }

    try {
      await revalidate(parsed.data)
    } catch (cause) {
      console.error(`[${app}] cache invalidation failed`, cause)
      return error(
        500,
        "invalidation_failed",
        "Cache invalidation failed",
        correlationId
      )
    }

    const body = InvalidateResponseSchema.parse({
      app,
      revalidated: parsed.data.paths.length + parsed.data.tags.length,
    })
    return Response.json(body, {
      headers: {
        "Cache-Control": "no-store",
        ...(correlationId ? { [CORRELATION_HEADER]: correlationId } : {}),
      },
    })
  }

  return async function timedInvalidationRequest(
    request: Request
  ): Promise<Response> {
    const started = performance.now()
    const response = await handleInvalidationRequest(request)
    const durationMs = performance.now() - started
    const correlationId = request.headers.get(CORRELATION_HEADER)
    observeRequest({
      app,
      route: "/internal/v1/invalidate",
      method: request.method,
      status: response.status,
      durationMs,
    })
    logRequest({
      app,
      route: "/internal/v1/invalidate",
      method: request.method,
      status: response.status,
      durationMs,
      correlationId,
    })
    return response
  }
}
