import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import "./load-env"

import { authConfig } from "../lib/auth"

/**
 * Guards the session-cookie decisions recorded in ADR 0018 and ADR 0029.
 *
 * 1. The control tower must never share a cookie domain with the customer app:
 *    `Domain=.asynchrone.space` would ship the admin session to every
 *    subdomain (including vendor hosts) and allow cookie tossing.
 * 2. No customer app may set a shared `.copilot`/`.asynchrone.space` cookie
 *    either: every domain app is a relying party with its own host-only
 *    `__Host-asynchrone_session`.
 * 3. Every domain app keeps the same auth surface: OIDC routes, JWKS session
 *    verification, back-channel logout and an audience-bound internal service
 *    verifier.
 *
 * The check is static, so it runs without a database or a deployed fleet.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)

const DOMAIN_APPS: Record<string, string> = {
  projects: "PROJECTS_APP_URL",
  calendars: "CALENDARS_APP_URL",
  files: "FILES_APP_URL",
  messages: "MESSAGES_APP_URL",
  clients: "CLIENTS_APP_URL",
  employees: "EMPLOYEES_APP_URL",
}

const OIDC_PACKAGE = ["@workspace", "oidc"].join("/")
const SERVICE_AUTH_PACKAGE = ["@workspace", "service-auth"].join("/")

const failures: string[] = []

function check(condition: unknown, message: string) {
  if (condition) {
    console.log(`✓ ${message}`)
    return
  }
  failures.push(message)
  console.error(`✗ ${message}`)
}

function read(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, relative), "utf8")
}

function source(relative: string): string {
  return stripComments(read(relative))
}

function exists(relative: string): boolean {
  return fs.existsSync(path.join(repoRoot, relative))
}

function stripComments(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n")
}

function walk(relative: string): string[] {
  const absolute = path.join(repoRoot, relative)
  if (!fs.existsSync(absolute)) return []
  const files: string[] = []
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === "dist"
    ) {
      continue
    }
    const child = path.join(relative, entry.name)
    if (entry.isDirectory()) files.push(...walk(child))
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) files.push(child)
  }
  return files
}

// --- Control tower isolation ------------------------------------------------

check(
  !(
    authConfig.advanced as
      { crossSubDomainCookies?: { enabled?: boolean } } | undefined
  )?.crossSubDomainCookies?.enabled,
  "cross-subdomain cookies are disabled"
)
check(
  authConfig.advanced?.cookiePrefix === "asynchrone-space-control-tower",
  "the session cookie prefix is scoped to this app"
)
check(
  authConfig.emailAndPassword?.disableSignUp === true,
  "public sign-up is disabled"
)
check(
  authConfig.session?.expiresIn === 4 * 60 * 60,
  "platform sessions expire after 4 hours"
)
check(
  Array.isArray(authConfig.trustedOrigins) &&
    authConfig.trustedOrigins.length === 1,
  "only this app's origin is trusted"
)
check(
  authConfig.plugins?.some(
    (plugin) => (plugin as { id?: string }).id === "two-factor"
  ),
  "two-factor authentication is available"
)
check(
  authConfig.secret === process.env.CONTROL_TOWER_BETTER_AUTH_SECRET,
  "uses CONTROL_TOWER_BETTER_AUTH_SECRET"
)
if (process.env.BETTER_AUTH_SECRET) {
  check(
    authConfig.secret !== process.env.BETTER_AUTH_SECRET,
    "does not reuse the customer app's BETTER_AUTH_SECRET"
  )
}

// --- No shared customer cookie ---------------------------------------------

const scriptPath = "apps/control-tower/scripts/verify-auth-config.ts"
const appSources = [
  ...walk("apps"),
  ...walk("packages"),
].filter(
  (file) =>
    file !== scriptPath &&
    !file.endsWith(".test.ts") &&
    !file.includes("/e2e/") &&
    !file.includes("/scripts/")
)

const sharedCookiePatterns = [
  { label: "Domain= cookie attribute", pattern: /(^|[^.\w])Domain\s*=/ },
  { label: "cookieDomain option", pattern: /cookieDomain/ },
  { label: "crossSubDomainCookies", pattern: /crossSubDomainCookies/ },
  { label: "AUTH_COOKIE_DOMAIN", pattern: /AUTH_COOKIE_DOMAIN/ },
]

for (const { label, pattern } of sharedCookiePatterns) {
  const offenders = appSources.filter((file) => pattern.test(source(file)))
  check(
    offenders.length === 0,
    `no app sets a shared customer cookie (${label})${offenders.length ? `: ${offenders.join(", ")}` : ""}`
  )
}

const envExamples = [
  "apps/copilot/.env.example",
  ...Object.keys(DOMAIN_APPS).map((app) => `apps/${app}/.env.example`),
].filter(exists)
check(
  envExamples.every((file) => !/AUTH_COOKIE_DOMAIN|COOKIE_DOMAIN/.test(read(file))),
  "no environment file configures a cookie domain"
)

// --- Uniform domain-app relying party --------------------------------------

for (const [app, originEnv] of Object.entries(DOMAIN_APPS)) {
  const oidc = source(`apps/${app}/lib/oidc.ts`)
  check(
    oidc.includes(`from "${OIDC_PACKAGE}"`) &&
      oidc.includes("PrismaOidcSessionStore") &&
      oidc.includes(`internalAudience("${app}")`),
    `${app}: uses ${OIDC_PACKAGE} with its own audience`
  )
  check(
    oidc.includes(
      `secureCookies: env.${originEnv}.startsWith("https://")`
    ),
    `${app}: derives secure cookies from its HTTPS origin`
  )
  check(
    !/sessionCookieName\s*:/.test(oidc),
    `${app}: keeps the package's host-only cookie name`
  )

  const routes = [
    "sign-in",
    "callback",
    "logout",
    "switch",
    "backchannel-logout",
  ]
  check(
    routes.every((route) =>
      exists(`apps/${app}/app/api/auth/${route}/route.ts`)
    ),
    `${app}: exposes every OIDC auth route`
  )
  check(
    source(`apps/${app}/app/api/auth/backchannel-logout/route.ts`).includes(
      "handleBackChannelLogout"
    ),
    `${app}: handles signed back-channel logout`
  )
  check(
    source(`apps/${app}/lib/auth/session.ts`).includes("resolveSession"),
    `${app}: resolves sessions through the verifying package`
  )
  check(
    source(`apps/${app}/app/api/auth/switch/route.ts`).includes(
      "clearSessionCookie"
    ),
    `${app}: ends the local session on organization switch`
  )

  const internal = source(`apps/${app}/lib/internal/service.ts`)
  check(
    internal.includes("ServiceTokenVerifier") &&
      internal.includes("domainVerifier") &&
      internal.includes(`internalAudience("${app}")`),
    `${app}: internal services verify an audience-bound token`
  )
  const revoke = source(`apps/${app}/app/internal/v1/auth/revoke/route.ts`)
  check(
    revoke.includes("requireAppService") &&
      revoke.includes("SERVICE_SCOPES.domainWrite") &&
      revoke.includes("deleteBySid"),
    `${app}: revokes local sessions for a Copilot sid`
  )
  check(
    read(`apps/${app}/package.json`).includes(`"${SERVICE_AUTH_PACKAGE}"`),
    `${app}: declares ${SERVICE_AUTH_PACKAGE}`
  )
  check(
    read(`apps/${app}/proxy.ts`).includes("(?!api|internal|"),
    `${app}: keeps /internal out of the i18n middleware`
  )
}

// --- Copilot remains a single host-only authorization server ----------------

const authSource = source("packages/auth/src/create-auth.ts")
check(
  !/crossSubDomainCookies/.test(authSource),
  "Copilot does not enable cross-subdomain cookies"
)
check(
  authSource.includes('ctx.path === "/organization/set-active"') &&
    authSource.includes("revokeAppSessions"),
  "organization switch revokes domain-app sessions"
)
check(
  source("apps/copilot/app/api/platform/stop-impersonating/route.ts").includes(
    "deleteSession"
  ),
  "stop-impersonation deletes the session through Better Auth (back-channel logout)"
)

if (failures.length > 0) {
  console.error(`\n${failures.length} auth configuration check(s) failed.`)
  process.exit(1)
}

console.log("\nFleet auth configuration is safe.")
