#!/usr/bin/env node
/**
 * Helm verification for the fleet deployment model (#168).
 *
 * Builds the vendored generic app chart, lints and renders the umbrella, then
 * renders every app alias on its own and the generic chart standalone. It also
 * asserts the wildcard certificates, the www redirect, the Copilot discovery
 * URLs and the single-owner cron schedule, so a chart regression fails CI
 * before the archive check does.
 *
 * Requires `helm` on PATH. Run with `npm run verify:helm`.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const CHART = "charts/asynchrone-space"
const APP_CHART = "charts/asynchrone-space-app"
const IMAGE_TAG = "ci-placeholder-tag"

const APPS = [
  "landing",
  "copilot",
  "projects",
  "calendars",
  "files",
  "messages",
  "clients",
  "employees",
  "control-tower",
]

const EXPECTED_CRONJOBS = [
  "asynchrone-space-copilot-audit-retention",
  "asynchrone-space-copilot-data-exports",
  "asynchrone-space-copilot-organization-deletion",
  "asynchrone-space-copilot-trial-expiry",
  "asynchrone-space-files-uploads-sweep",
  "asynchrone-space-projects-repository-sync",
]

function helm(args) {
  return execFileSync("helm", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
}

function check(condition, message) {
  if (!condition) throw new Error(`✗ ${message}`)
  console.log(`✓ ${message}`)
}

function documents(rendered) {
  return rendered
    .split(/\n---\n/)
    .map((doc) => doc.trim())
    .filter(Boolean)
}

function kind(doc) {
  return doc.match(/^kind: (.+)$/m)?.[1]
}

function resourceName(doc) {
  return doc.match(/^metadata:\n(?:.*\n)*?  name: (.+)$/m)?.[1]
}

function resourceNames(rendered, resourceKind) {
  return documents(rendered)
    .filter((doc) => kind(doc) === resourceKind)
    .map(resourceName)
    .filter(Boolean)
}

console.log("→ helm dependency build")
helm(["dependency", "build", CHART])

// The archive is committed for Git-based chart sources. Rebuild it above and
// compare the contents with the source (the CI job repeats this check).
const archive = execFileSync(
  "sh",
  ["-c", `ls ${CHART}/charts/asynchrone-space-app-*.tgz`],
  { cwd: ROOT, encoding: "utf8" }
).trim()
const tmp = mkdtempSync(join(tmpdir(), "asynchrone-space-chart-"))
try {
  execFileSync("tar", ["-xzf", join(ROOT, archive), "-C", tmp])
  const extracted = join(tmp, "asynchrone-space-app")
  const source = join(ROOT, APP_CHART)
  check(
    helm(["show", "chart", APP_CHART]).trim() ===
      helm(["show", "chart", join(ROOT, archive)]).trim(),
    "vendored archive metadata matches the generic chart"
  )
  for (const file of [
    // Helm re-serializes Chart.yaml when packaging; CI compares it through
    // `helm show chart` instead.
    "values.yaml",
    "templates/_helpers.tpl",
    "templates/deployment.yaml",
    "templates/cronjobs.yaml",
  ]) {
    const sourceFile = readFileSync(join(source, file), "utf8")
    const archiveFile = readFileSync(join(extracted, file), "utf8")
    check(
      sourceFile === archiveFile,
      `vendored archive matches ${APP_CHART}/${file}`
    )
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log("→ helm lint --strict")
helm(["lint", "--strict", CHART, "--set", `global.imageTag=${IMAGE_TAG}`])
check(true, "helm lint --strict passes")

const rendered = helm([
  "template",
  "asynchrone-space",
  CHART,
  "--namespace",
  "asynchrone-space",
  "--set",
  `global.imageTag=${IMAGE_TAG}`,
])

check(
  resourceNames(rendered, "Deployment").sort().join(",") ===
    APPS.map((app) => `asynchrone-space-${app}`)
      .sort()
      .join(","),
  "the umbrella renders one Deployment per app"
)

check(
  resourceNames(rendered, "CronJob").sort().join(",") ===
    [...EXPECTED_CRONJOBS].sort().join(","),
  "every cron has exactly one owner"
)

const certificates = documents(rendered).filter(
  (doc) => kind(doc) === "Certificate"
)
check(certificates.length === 2, "two wildcard certificates render")
check(
  certificates.some(
    (doc) =>
      doc.includes("secretName: asynchrone-space-tls") &&
      doc.includes('- "asynchrone.space"') &&
      doc.includes('- "*.asynchrone.space"')
  ),
  "the apex/wildcard certificate covers asynchrone.space and *.asynchrone.space"
)
check(
  certificates.some(
    (doc) =>
      doc.includes("secretName: asynchrone-space-domain-tls") &&
      doc.includes('- "*.copilot.asynchrone.space"')
  ),
  "the domain certificate covers *.copilot.asynchrone.space"
)

check(
  rendered.includes('host: "www.asynchrone.space"') &&
    rendered.includes(
      'nginx.ingress.kubernetes.io/from-to-www-redirect: "true"'
    ),
  "www.asynchrone.space redirects to the apex"
)

check(
  rendered.includes('BETTER_AUTH_URL: "https://copilot.asynchrone.space"') &&
    rendered.includes(
      'MCP_RESOURCE_URL: "https://copilot.asynchrone.space/mcp"'
    ) &&
    rendered.includes('PLATFORM_APP_URL: "https://copilot.asynchrone.space"'),
  "Copilot discovery URLs point at copilot.asynchrone.space"
)

check(
  !rendered.includes("AUTH_COOKIE_DOMAIN"),
  "no shared AUTH_COOKIE_DOMAIN is rendered"
)

// Fleet observability (issue #170): every app exposes /api/metrics, the pods
// carry the scrape annotations and the umbrella renders the alert rules.
check(
  (rendered.match(/prometheus\.io\/scrape: "true"/g) ?? []).length ===
    APPS.length,
  "every app pod template is annotated for Prometheus scraping"
)
check(
  rendered.includes('prometheus.io/path: "/api/metrics"'),
  "the scrape path is /api/metrics"
)
const alerts = documents(rendered).filter(
  (doc) => kind(doc) === "PrometheusRule"
)
check(alerts.length === 1, "one fleet PrometheusRule renders")
for (const alert of [
  "AsynchroneHighErrorRate",
  "AsynchroneDatabasePoolSaturation",
  "AsynchroneDatabasePoolWaiting",
  "AsynchroneCronJobFailed",
  "AsynchroneCronJobMissedHourly",
  "AsynchroneCronJobMissedDaily",
  "AsynchroneAppUnavailable",
]) {
  check(alerts[0]?.includes(`alert: ${alert}`), `the ${alert} alert renders`)
}

// Connection budget (ADR 0038): the chart refuses an over-budget pool and an
// over-budget fleet, so a values edit cannot exhaust the shared role.
function renders(args) {
  try {
    helm(["template", "asynchrone-space", CHART, ...args])
    return true
  } catch {
    return false
  }
}
check(
  !renders([
    "--set",
    "global.imageTag=ci",
    "--set",
    "copilot.config.DATABASE_POOL_MAX=99",
  ]),
  "an app pool above its ceiling fails the release"
)
check(
  !renders([
    "--set",
    "global.imageTag=ci",
    "--set",
    "projects.autoscaling.maxReplicas=30",
  ]),
  "an over-budget fleet fails the release"
)

for (const app of APPS) {
  const args = [
    "template",
    "asynchrone-space",
    CHART,
    "--namespace",
    "asynchrone-space",
    "--set",
    `global.imageTag=${IMAGE_TAG}`,
  ]
  for (const other of APPS) {
    args.push("--set", `${other}.enabled=${other === app}`)
  }
  const appRendered = helm(args)
  const deployments = resourceNames(appRendered, "Deployment")
  check(
    deployments.length === 1 && deployments[0] === `asynchrone-space-${app}`,
    `helm template renders ${app} alone`
  )

  const standalone = helm([
    "template",
    "app",
    APP_CHART,
    "--set",
    `nameOverride=${app}`,
    "--set",
    `image.repository=ghcr.io/example/${app}`,
    "--set",
    `image.tag=${IMAGE_TAG}`,
    "--set",
    "secret.enabled=false",
    "--set",
    "ingress.enabled=false",
    "--set",
    "cronjobs.enabled=false",
    "--set",
    "cache.mountPath=/tmp/next-cache",
  ])
  check(
    resourceNames(standalone, "Deployment").join(",") === `app-${app}`,
    `helm template renders the generic chart standalone for ${app}`
  )
}

console.log("\nAll Helm checks passed.")
