import { cookies, headers } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

import {
  CORRELATION_COOKIE,
  CORRELATION_HEADER,
  CORRELATION_QUERY_PARAM,
  CORRELATION_RESPONSE_HEADER,
  correlationHeaders,
  resolveCorrelationId,
} from "./correlation"
import { logJson, logRequest } from "./log"
import {
  observeRequest,
  poolSnapshot,
  recordCron,
  recordPool,
  renderPrometheus,
  type PoolLike,
} from "./metrics"

export {
  CORRELATION_COOKIE,
  CORRELATION_HEADER,
  CORRELATION_QUERY_PARAM,
  CORRELATION_RESPONSE_HEADER,
  correlateUrl,
} from "./correlation"

/** The correlation id for the current server request (route, action, page). */
export async function getCorrelationId(): Promise<string | null> {
  try {
    const requestHeaders = await headers()
    const fromHeader = requestHeaders.get(CORRELATION_HEADER)
    if (fromHeader) return fromHeader
    const jar = await cookies()
    return jar.get(CORRELATION_COOKIE)?.value ?? null
  } catch {
    // Outside a request scope (build time, scripts).
    return null
  }
}

/**
 * Resolve the id for an inbound proxy request and copy it onto the response
 * and a host-only, JS-readable cookie so the client can carry it into a
 * cross-app link (`?rid=`).
 */
export function withCorrelation<T extends Response>(
  request: NextRequest,
  response: T
): T {
  const correlationId = resolveCorrelationId({
    header: request.headers.get(CORRELATION_HEADER),
    query: request.nextUrl.searchParams.get(CORRELATION_QUERY_PARAM),
    cookie: request.cookies.get(CORRELATION_COOKIE)?.value ?? null,
  })
  response.headers.set(CORRELATION_RESPONSE_HEADER, correlationId)
  if (response instanceof NextResponse) {
    response.cookies.set(CORRELATION_COOKIE, correlationId, {
      httpOnly: false,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 30,
    })
  }
  return response
}

export interface ObservedRouteOptions {
  app: string
  route: string
}

/**
 * Wrap a route handler with request timing, metrics and a structured log line.
 *
 * The correlation id is echoed on the response and included in the log, so a
 * browser request and the domain internal calls it triggers share one id.
 */
export function withObservedRoute<TContext = unknown>(
  options: ObservedRouteOptions,
  handler: (request: Request, context: TContext) => Promise<Response> | Response
): (request: Request, context?: TContext) => Promise<Response> {
  return async (request, context) => {
    const started = performance.now()
    const correlationId = request.headers.get(CORRELATION_HEADER) ?? null
    let status = 500
    try {
      const response = await handler(request, context as TContext)
      status = response.status
      for (const [key, value] of Object.entries(
        correlationHeaders(correlationId ?? "")
      )) {
        response.headers.set(key, value)
      }
      return response
    } catch (error) {
      logJson("error", "http.unhandled", {
        app: options.app,
        route: options.route,
        correlationId: correlationId ?? undefined,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      const durationMs = performance.now() - started
      observeRequest({
        app: options.app,
        route: options.route,
        method: request.method,
        status,
        durationMs,
      })
      logRequest({
        app: options.app,
        route: options.route,
        method: request.method,
        status,
        durationMs,
        correlationId,
      })
    }
  }
}

export interface HealthCheckResult {
  ok: boolean
  detail?: string
}

export interface HealthRouteOptions {
  app: string
  /** Probe the database (or any other dependency). Omit for a stateless app. */
  check?: () => Promise<void>
  pool?: PoolLike | (() => PoolLike | null | undefined)
  /** Extra named checks rendered in the payload. */
  extraChecks?: () => Promise<Record<string, HealthCheckResult>>
}

function resolvePool(
  pool: HealthRouteOptions["pool"]
): PoolLike | null | undefined {
  return typeof pool === "function" ? pool() : pool
}

/**
 * `GET /api/health`: the readiness probe every app owns.
 *
 * A failed dependency returns 503 so Kubernetes stops routing to the pod
 * without restarting it; the payload names what failed and includes the pool
 * snapshot for the on-call human.
 */
export function createHealthRoute({
  app,
  check,
  pool,
  extraChecks,
}: HealthRouteOptions): (request: Request) => Promise<Response> {
  return withObservedRoute({ app, route: "/api/health" }, async (request) => {
    const checks: Record<string, HealthCheckResult> = {}
    if (check) {
      try {
        await check()
        checks.database = { ok: true }
      } catch (error) {
        checks.database = {
          ok: false,
          detail: error instanceof Error ? error.message : "unavailable",
        }
      }
    }
    if (extraChecks) Object.assign(checks, await extraChecks())

    const snapshot = poolSnapshot(resolvePool(pool))
    if (snapshot) recordPool(app, snapshot)
    const ok = Object.values(checks).every((entry) => entry.ok)
    const correlationId =
      request.headers.get(CORRELATION_HEADER) ?? (await getCorrelationId())

    return Response.json(
      {
        ok,
        app,
        version: process.env.GIT_COMMIT_SHA ?? null,
        uptimeSeconds: Math.round(process.uptime()),
        correlationId,
        checks,
        pool: snapshot,
      },
      {
        status: ok ? 200 : 503,
        headers: {
          "Cache-Control": "no-store",
          ...correlationHeaders(correlationId ?? ""),
        },
      }
    )
  })
}

export interface MetricsRouteOptions {
  app: string
  pool?: PoolLike | (() => PoolLike | null | undefined)
  /** Extra gauges recorded on every scrape. */
  beforeRender?: () => void
}

/**
 * `GET /api/metrics`: Prometheus text exposition.
 *
 * The Helm chart annotates every pod with `prometheus.io/scrape`. The endpoint
 * exposes counts only — never a tenant id, a user id or a URL with a query
 * string — so it is safe to leave unauthenticated inside the cluster.
 */
export function createMetricsRoute({
  app,
  pool,
  beforeRender,
}: MetricsRouteOptions): (request: Request) => Promise<Response> {
  return withObservedRoute({ app, route: "/api/metrics" }, async (request) => {
    beforeRender?.()
    recordPool(app, poolSnapshot(resolvePool(pool)))
    const correlationId = request.headers.get(CORRELATION_HEADER) ?? null
    return new Response(
      renderPrometheus(app, {
        build: process.env.GIT_COMMIT_SHA ?? "unknown",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
          "Cache-Control": "no-store",
          ...correlationHeaders(correlationId ?? ""),
        },
      }
    )
  })
}

/** Log a cron run for the alert rule that watches `asynchrone_cron_runs_total`. */
export function logCronRun(
  app: string,
  job: string,
  outcome: "success" | "failure",
  correlationId?: string | null
): void {
  recordCron(app, job, outcome)
  logJson(outcome === "success" ? "info" : "error", "cron.run", {
    app,
    job,
    outcome,
    correlationId: correlationId ?? undefined,
  })
}

/**
 * Wrap a scheduled route: request timing plus an explicit success/failure
 * counter. The alert rules in charts/asynchrone-space/templates/prometheusrule.yaml
 * watch `asynchrone_cron_runs_total{outcome="failure"}`.
 */
export function createCronRoute(
  options: { app: string; job: string; route?: string },
  handler: (request: Request) => Promise<Response> | Response
): (request: Request) => Promise<Response> {
  const route = options.route ?? `/api/cron/${options.job}`
  return withObservedRoute({ app: options.app, route }, async (request) => {
    const correlationId = request.headers.get(CORRELATION_HEADER) ?? null
    try {
      const response = await handler(request)
      // A cron route that answers 401/500 did not do its work.
      logCronRun(
        options.app,
        options.job,
        response.ok ? "success" : "failure",
        correlationId
      )
      return response
    } catch (error) {
      logCronRun(options.app, options.job, "failure", correlationId)
      throw error
    }
  })
}
