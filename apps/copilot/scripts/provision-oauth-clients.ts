import "dotenv/config"

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { prisma } from "../lib/prisma"
import {
  buildOAuthClientManifest,
  type OAuthClientManifestEntry,
} from "../lib/oauth/clients"

/**
 * Provision first-party OAuth clients.
 *
 * Dry run (default):
 *   npm run oauth:clients --workspace=copilot
 *
 * Apply (requires an admin session cookie):
 *   OAUTH_ADMIN_COOKIE="better-auth.session_token=..." \
 *   BETTER_AUTH_URL="https://copilot.asynchrone.space" \
 *   npm run oauth:clients --workspace=copilot -- --apply --write-env apps/copilot/.env.oauth
 *
 * Rotate every client secret:
 *   ... -- --apply --rotate --write-env apps/copilot/.env.oauth
 *
 * The admin cookie belongs to a user allowed to use the server-only admin
 * client endpoints. Secrets are printed once or written to the opt-in env file;
 * they are never committed (`.env*` is gitignored).
 */

interface Args {
  apply: boolean
  rotate: boolean
  writeEnv: string | null
  only: Set<string> | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    rotate: false,
    writeEnv: null,
    only: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--apply") args.apply = true
    else if (arg === "--rotate") args.rotate = true
    else if (arg === "--write-env") args.writeEnv = argv[++i] ?? null
    else if (arg === "--only") {
      args.only = new Set((argv[++i] ?? "").split(",").filter(Boolean))
    }
  }
  return args
}

function baseUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    ""
  )
}

function cookie(): string {
  const value = process.env.OAUTH_ADMIN_COOKIE
  if (!value) {
    throw new Error(
      "OAUTH_ADMIN_COOKIE is required for --apply. Use the Cookie header of an admin session."
    )
  }
  return value
}

function createBody(entry: OAuthClientManifestEntry) {
  const body: Record<string, unknown> = {
    client_name: entry.clientName,
    grant_types: entry.grantTypes,
    token_endpoint_auth_method: entry.tokenEndpointAuthMethod,
    application_type: entry.applicationType,
    client_secret_expires_at: 0,
    skip_consent: entry.skipConsent,
    enable_end_session: entry.enableEndSession,
    backchannel_logout_session_required: entry.backchannelLogoutSessionRequired,
    client_credentials_scopes: entry.clientCredentialsScopes,
    resources: entry.resources,
  }
  if (entry.redirectUris.length) body.redirect_uris = entry.redirectUris
  if (entry.postLogoutRedirectUris.length) {
    body.post_logout_redirect_uris = entry.postLogoutRedirectUris
  }
  if (entry.backchannelLogoutUri) {
    body.backchannel_logout_uri = entry.backchannelLogoutUri
  }
  if (entry.scopes.length) body.scope = entry.scopes.join(" ")
  return body
}

function updateBody(entry: OAuthClientManifestEntry) {
  const body = createBody(entry)
  delete body.resources
  delete body.client_secret_expires_at
  return { client_id: entry.clientId, update: body }
}

async function request<T>(
  path: string,
  init: RequestInit & { cookie?: string }
): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: init.cookie ?? cookie(),
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} failed (${response.status}): ${
        typeof body === "object" && body && "error_description" in body
          ? String((body as { error_description: unknown }).error_description)
          : text
      }`
    )
  }
  return body as T
}

function upsertEnvFile(path: string, values: Record<string, string>): void {
  let content = ""
  try {
    content = readFileSync(path, "utf8")
  } catch {
    content = ""
  }
  const lines = content.split("\n")
  const keys = new Set(Object.keys(values))
  const next = lines.filter(
    (line) => ![...keys].some((key) => line.startsWith(`${key}=`))
  )
  for (const [key, value] of Object.entries(values)) {
    next.push(`${key}=${value}`)
  }
  writeFileSync(path, next.filter(Boolean).join("\n") + "\n", { mode: 0o600 })
}

function printPlan(entries: OAuthClientManifestEntry[]): void {
  for (const entry of entries) {
    console.log(
      [
        entry.clientId,
        entry.grantTypes.join(","),
        entry.resources.join(","),
        entry.clientCredentialsScopes.join(","),
      ].join("  ")
    )
  }
}

async function applyClient(
  entry: OAuthClientManifestEntry,
  rotate: boolean
): Promise<Record<string, string>> {
  const values: Record<string, string> = { [entry.clientIdEnv]: entry.clientId }
  const existing = await prisma.oauthClient.findUnique({
    where: { clientId: entry.clientId },
    select: { clientId: true },
  })

  if (!existing) {
    const created = await request<{ client_secret?: string }>(
      "/api/auth/admin/oauth2/create-client",
      { method: "POST", body: JSON.stringify(createBody(entry)) }
    )
    if (!created.client_secret) {
      throw new Error(`${entry.clientId}: create returned no client secret`)
    }
    values[entry.clientSecretEnv] = created.client_secret
    console.log(`created ${entry.clientId}`)
    return values
  }

  await request("/api/auth/admin/oauth2/update-client", {
    method: "PATCH",
    body: JSON.stringify(updateBody(entry)),
  })
  const links = await prisma.oauthClientResource.findMany({
    where: { clientId: entry.clientId },
    select: { resourceId: true },
  })
  const linked = new Set(links.map((link) => link.resourceId))
  for (const resource of entry.resources) {
    if (linked.has(resource)) continue
    await request(
      `/api/auth/admin/oauth2/resources/${encodeURIComponent(
        resource
      )}/clients/${encodeURIComponent(entry.clientId)}`,
      { method: "POST", body: "{}" }
    )
  }
  console.log(`updated ${entry.clientId}`)

  if (rotate) {
    const rotated = await request<{ client_secret?: string }>(
      "/api/auth/oauth2/client/rotate-secret",
      { method: "POST", body: JSON.stringify({ client_id: entry.clientId }) }
    )
    if (!rotated.client_secret) {
      throw new Error(`${entry.clientId}: rotation returned no client secret`)
    }
    values[entry.clientSecretEnv] = rotated.client_secret
    console.log(`rotated ${entry.clientId}`)
  }
  return values
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const entries = buildOAuthClientManifest().filter(
    (entry) => !args.only || args.only.has(entry.key)
  )

  if (!args.apply) {
    console.log("OAuth client manifest (dry run; no secrets):")
    printPlan(entries)
    console.log(
      "\nRun with -- --apply --write-env <path> to create/update clients."
    )
    return
  }

  const values: Record<string, string> = {}
  for (const entry of entries) {
    Object.assign(values, await applyClient(entry, args.rotate))
  }

  if (args.writeEnv) {
    const path = resolve(args.writeEnv)
    upsertEnvFile(path, values)
    console.log(
      `\nWrote ${Object.keys(values).length} values to ${path} (mode 600).`
    )
  } else {
    console.warn(
      "\nNo --write-env path supplied. Treat the following as one-time secrets:"
    )
    for (const [key, value] of Object.entries(values)) {
      console.log(`${key}=${value}`)
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
