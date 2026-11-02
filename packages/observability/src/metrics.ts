/**
 * A tiny in-process metrics registry (issue #170).
 *
 * Every app exposes `/api/metrics` in the Prometheus text format. The registry
 * is deliberately dependency-free: counters and one duration histogram are
 * enough to alert on 5xx rate, request latency, database-pool saturation and
 * cron-job failures, and it works identically in `next dev`, a container and
 * the control tower without an OpenTelemetry collector.
 *
 * The process is the scrape target, so the fleet is observed per replica. The
 * Helm chart adds `prometheus.io/scrape` annotations to every pod template and
 * the umbrella chart ships the alert rules.
 */

export const DURATION_BUCKETS_SECONDS = [
  0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const

export type Labels = Record<string, string | number | undefined>

interface CounterEntry {
  name: string
  help: string
  labels: string
  value: number
}

interface HistogramEntry {
  name: string
  help: string
  labels: string
  buckets: number[]
  count: number
  sum: number
}

const counters = new Map<string, CounterEntry>()
const histograms = new Map<string, HistogramEntry>()

function labelKey(labels: Labels): string {
  return Object.keys(labels)
    .filter((key) => labels[key] !== undefined)
    .sort()
    .map((key) => `${key}="${escapeLabel(String(labels[key]))}"`)
    .join(",")
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
}

function entryKey(name: string, labels: string): string {
  return labels ? `${name}{${labels}}` : name
}

/** Increment a counter. */
export function counter(
  name: string,
  help: string,
  labels: Labels = {},
  amount = 1
): void {
  const rendered = labelKey(labels)
  const key = entryKey(name, rendered)
  const entry = counters.get(key)
  if (entry) {
    entry.value += amount
    return
  }
  counters.set(key, { name, help, labels: rendered, value: amount })
}

/** Observe one value in a histogram. */
export function observe(
  name: string,
  help: string,
  value: number,
  labels: Labels = {},
  buckets: readonly number[] = DURATION_BUCKETS_SECONDS
): void {
  const rendered = labelKey(labels)
  const key = entryKey(name, rendered)
  let entry = histograms.get(key)
  if (!entry) {
    entry = {
      name,
      help,
      labels: rendered,
      buckets: buckets.map(() => 0),
      count: 0,
      sum: 0,
    }
    histograms.set(key, entry)
  }
  entry.count += 1
  entry.sum += value
  for (let index = 0; index < buckets.length; index += 1) {
    if (value <= (buckets[index] ?? Infinity)) {
      entry.buckets[index] = (entry.buckets[index] ?? 0) + 1
    }
  }
}

export interface RequestObservation {
  app: string
  route: string
  method?: string
  status: number
  durationMs: number
}

/** Record one completed HTTP request. */
export function observeRequest({
  app,
  route,
  method = "GET",
  status,
  durationMs,
}: RequestObservation): void {
  const labels = { app, route, method, status }
  counter(
    "asynchrone_http_requests_total",
    "HTTP requests handled by the app.",
    labels
  )
  if (status >= 500) {
    counter(
      "asynchrone_http_errors_total",
      "HTTP 5xx responses handled by the app.",
      { app, route, method }
    )
  }
  observe(
    "asynchrone_http_request_duration_seconds",
    "HTTP request duration in seconds.",
    durationMs / 1000,
    { app, route, method }
  )
}

export interface PoolSnapshot {
  total: number
  idle: number
  waiting: number
  max: number
}

export interface PoolLike {
  totalCount?: number
  idleCount?: number
  waitingCount?: number
  options?: { max?: number }
}

/** Read a `pg.Pool`'s counters without importing `pg`. */
export function poolSnapshot(
  pool: PoolLike | undefined | null
): PoolSnapshot | null {
  if (!pool) return null
  const max = pool.options?.max ?? 0
  const total = pool.totalCount ?? 0
  return {
    total,
    idle: pool.idleCount ?? 0,
    waiting: pool.waitingCount ?? 0,
    max,
  }
}

/** 0–1 share of the pool budget currently checked out. */
export function poolSaturation(snapshot: PoolSnapshot | null): number {
  if (!snapshot || snapshot.max <= 0) return 0
  const inUse = Math.max(0, snapshot.total - snapshot.idle)
  return Math.min(1, inUse / snapshot.max)
}

/** Record the pool gauges. Call before rendering `/api/metrics`. */
export function recordPool(app: string, snapshot: PoolSnapshot | null): void {
  if (!snapshot) return
  const help = "PostgreSQL pool connections and budget usage."
  setGauge(
    help,
    "asynchrone_db_pool_connections",
    { app, state: "total" },
    snapshot.total
  )
  setGauge(
    help,
    "asynchrone_db_pool_connections",
    { app, state: "idle" },
    snapshot.idle
  )
  setGauge(
    help,
    "asynchrone_db_pool_connections",
    { app, state: "waiting" },
    snapshot.waiting
  )
  setGauge(
    help,
    "asynchrone_db_pool_connections",
    { app, state: "max" },
    snapshot.max
  )
  setGauge(
    "Share of the database pool budget currently checked out.",
    "asynchrone_db_pool_saturation",
    { app },
    Number(poolSaturation(snapshot).toFixed(4))
  )
}

function setGauge(
  help: string,
  name: string,
  labels: Labels,
  value: number
): void {
  const rendered = labelKey(labels)
  const key = entryKey(name, rendered)
  const entry = counters.get(key)
  if (entry) {
    entry.help = help
    entry.value = value
    return
  }
  counters.set(key, { name, help, labels: rendered, value })
}

/** Record a cron run. */
export function recordCron(
  app: string,
  job: string,
  outcome: "success" | "failure"
): void {
  counter(
    "asynchrone_cron_runs_total",
    "Cron-job runs triggered by the Kubernetes CronJob.",
    { app, job, outcome }
  )
}

/** Render the registry in the Prometheus text exposition format. */
export function renderPrometheus(
  app: string,
  extra: { build?: string } = {}
): string {
  const lines: string[] = []
  if (extra.build) {
    lines.push("# HELP asynchrone_app_info Build information for this app.")
    lines.push("# TYPE asynchrone_app_info gauge")
    lines.push(
      `asynchrone_app_info{app="${escapeLabel(app)}",version="${escapeLabel(extra.build)}"} 1`
    )
  }

  const emittedHelp = new Set<string>()
  const sortedCounters = [...counters.values()].sort((left, right) =>
    entryKey(left.name, left.labels).localeCompare(
      entryKey(right.name, right.labels)
    )
  )
  for (const entry of sortedCounters) {
    if (!emittedHelp.has(entry.name)) {
      emittedHelp.add(entry.name)
      lines.push(`# HELP ${entry.name} ${entry.help}`)
      lines.push(`# TYPE ${entry.name} gauge`)
    }
    lines.push(`${entryKey(entry.name, entry.labels)} ${entry.value}`)
  }

  const sortedHistograms = [...histograms.values()].sort((left, right) =>
    entryKey(left.name, left.labels).localeCompare(
      entryKey(right.name, right.labels)
    )
  )
  for (const entry of sortedHistograms) {
    if (!emittedHelp.has(entry.name)) {
      emittedHelp.add(entry.name)
      lines.push(`# HELP ${entry.name} ${entry.help}`)
      lines.push(`# TYPE ${entry.name} histogram`)
    }
    entry.buckets.forEach((count, index) => {
      const le = DURATION_BUCKETS_SECONDS[index] ?? "+Inf"
      lines.push(
        `${entry.name}_bucket${withLe(entry.labels, String(le))} ${count}`
      )
    })
    lines.push(
      `${entry.name}_bucket${withLe(entry.labels, "+Inf")} ${entry.count}`
    )
    lines.push(`${entry.name}_sum${withBraces(entry.labels)} ${entry.sum}`)
    lines.push(`${entry.name}_count${withBraces(entry.labels)} ${entry.count}`)
  }

  return `${lines.join("\n")}\n`
}

function withBraces(labels: string): string {
  return labels ? `{${labels}}` : ""
}

function withLe(labels: string, le: string): string {
  return labels ? `{${labels},le="${le}"}` : `{le="${le}"}`
}

/** Test helper: clear every series. */
export function resetMetrics(): void {
  counters.clear()
  histograms.clear()
}
