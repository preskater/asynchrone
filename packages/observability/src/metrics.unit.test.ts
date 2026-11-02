import { beforeEach, describe, expect, it } from "vitest"

import {
  counter,
  observe,
  observeRequest,
  poolSaturation,
  poolSnapshot,
  recordCron,
  recordPool,
  renderPrometheus,
  resetMetrics,
} from "./metrics"

beforeEach(() => resetMetrics())

describe("metrics registry", () => {
  it("renders a counter with sorted, escaped labels", () => {
    counter("asynchrone_http_requests_total", "Requests.", {
      route: "/api/health",
      app: 'weird"app',
      status: 200,
    })
    const rendered = renderPrometheus("copilot", { build: "sha-abc" })
    expect(rendered).toContain(
      'asynchrone_http_requests_total{app="weird\\"app",route="/api/health",status="200"} 1'
    )
    expect(rendered).toContain(
      'asynchrone_app_info{app="copilot",version="sha-abc"} 1'
    )
  })

  it("counts 5xx separately and keeps histogram buckets cumulative", () => {
    observeRequest({ app: "files", route: "/x", status: 500, durationMs: 120 })
    observeRequest({ app: "files", route: "/x", status: 500, durationMs: 40 })
    observeRequest({ app: "files", route: "/x", status: 200, durationMs: 900 })
    const rendered = renderPrometheus("files")
    expect(rendered).toContain(
      'asynchrone_http_errors_total{app="files",method="GET",route="/x"} 2'
    )
    expect(rendered).toContain(
      'asynchrone_http_request_duration_seconds_bucket{app="files",method="GET",route="/x",le="0.05"} 1'
    )
    expect(rendered).toContain(
      'asynchrone_http_request_duration_seconds_bucket{app="files",method="GET",route="/x",le="0.1"} 1'
    )
    expect(rendered).toContain(
      'asynchrone_http_request_duration_seconds_bucket{app="files",method="GET",route="/x",le="+Inf"} 3'
    )
    expect(rendered).toContain(
      'asynchrone_http_request_duration_seconds_count{app="files",method="GET",route="/x"} 3'
    )
  })

  it("reports pool saturation from a pg-like pool", () => {
    const pool = {
      totalCount: 6,
      idleCount: 2,
      waitingCount: 1,
      options: { max: 8 },
    }
    expect(poolSnapshot(pool)).toEqual({
      total: 6,
      idle: 2,
      waiting: 1,
      max: 8,
    })
    expect(poolSaturation(poolSnapshot(pool))).toBe(0.5)
    expect(poolSaturation(null)).toBe(0)
    recordPool("copilot", poolSnapshot(pool))
    const rendered = renderPrometheus("copilot")
    expect(rendered).toContain(
      'asynchrone_db_pool_saturation{app="copilot"} 0.5'
    )
    expect(rendered).toContain(
      'asynchrone_db_pool_connections{app="copilot",state="max"} 8'
    )
  })

  it("records cron outcomes for the failure alert", () => {
    recordCron("projects", "repository-sync", "failure")
    expect(renderPrometheus("projects")).toContain(
      'asynchrone_cron_runs_total{app="projects",job="repository-sync",outcome="failure"} 1'
    )
  })

  it("observes arbitrary histograms", () => {
    observe("x_seconds", "X.", 0.01, { app: "a" })
    const rendered = renderPrometheus("a")
    expect(rendered).toContain('x_seconds_bucket{app="a",le="0.05"} 1')
    expect(rendered).toContain('x_seconds_count{app="a"} 1')
  })
})
