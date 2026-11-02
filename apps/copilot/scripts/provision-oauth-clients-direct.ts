import "dotenv/config"

import { createHash, randomBytes, randomUUID } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  buildOAuthClientManifest,
  type OAuthClientManifestEntry,
} from "../lib/oauth/clients"
import { prisma } from "../lib/prisma"

/**
 * Provision first-party OAuth clients directly in the identity database.
 *
 * Better Auth 1.7 marks the admin OAuth endpoints `SERVER_ONLY`, so they are
 * not reachable over HTTP. The provider stores `oauthClient.clientSecret` as
 * base64url(SHA-256(secret)) without padding; this script uses the same hash
 * and the stable `asynchrone-<app>` client IDs from the manifest.
 *
 * Usage:
 *   IDENTITY_DATABASE_URL=... DATABASE_URL=... \
 *   PROJECTS_APP_URL=https://... ... \
 *   npx tsx scripts/provision-oauth-clients-direct.ts \
 *     --write-env ~/.config/asynchrone-staging/oauth.env
 */
interface Args {
  writeEnv: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { writeEnv: null }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--write-env") args.writeEnv = argv[++i] ?? null
  }
  return args
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url")
}

function readEnv(path: string | null): Record<string, string> {
  if (!path) return {}
  try {
    const values: Record<string, string> = {}
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue
      const index = line.indexOf("=")
      values[line.slice(0, index)] = line.slice(index + 1)
    }
    return values
  } catch {
    return {}
  }
}

function writeEnv(path: string, values: Record<string, string>): void {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`)
  writeFileSync(path, lines.join("\n") + "\n", { mode: 0o600 })
}

function clientFields(entry: OAuthClientManifestEntry, clientSecret: string) {
  return {
    clientSecret,
    skipConsent: entry.skipConsent,
    enableEndSession: entry.enableEndSession,
    scopes: entry.scopes,
    clientCredentialsScopes: entry.clientCredentialsScopes,
    name: entry.clientName,
    softwareId: entry.clientId,
    redirectUris: entry.redirectUris,
    postLogoutRedirectUris: entry.postLogoutRedirectUris,
    backchannelLogoutUri: entry.backchannelLogoutUri ?? null,
    backchannelLogoutSessionRequired: entry.backchannelLogoutSessionRequired,
    tokenEndpointAuthMethod: entry.tokenEndpointAuthMethod,
    applicationType: entry.applicationType,
    grantTypes: entry.grantTypes,
    responseTypes: entry.grantTypes.includes("authorization_code") ? ["code"] : [],
    requirePKCE: entry.grantTypes.includes("authorization_code") ? true : null,
    updatedAt: new Date(),
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args.writeEnv) throw new Error("--write-env <path> is required")
  const outPath = resolve(args.writeEnv)
  const values = readEnv(outPath)

  for (const entry of buildOAuthClientManifest()) {
    const existing = await prisma.oauthClient.findUnique({
      where: { clientId: entry.clientId },
    })

    let secret = values[entry.clientSecretEnv]
    if (!secret) secret = randomBytes(32).toString("base64url")
    const hashed = hashSecret(secret)

    if (!existing) {
      await prisma.oauthClient.create({
        data: {
          id: randomUUID(),
          clientId: entry.clientId,
          userId: null,
          createdAt: new Date(),
          ...clientFields(entry, hashed),
        },
      })
      for (const resource of entry.resources) {
        await prisma.oauthClientResource.create({
          data: {
            id: randomUUID(),
            clientId: entry.clientId,
            resourceId: resource,
            createdAt: new Date(),
          },
        })
      }
      console.log(`created ${entry.clientId}`)
    } else {
      await prisma.oauthClient.update({
        where: { clientId: entry.clientId },
        data: clientFields(entry, hashed),
      })
      const links = await prisma.oauthClientResource.findMany({
        where: { clientId: entry.clientId },
        select: { resourceId: true },
      })
      const linked = new Set(links.map((link) => link.resourceId))
      for (const resource of entry.resources) {
        if (linked.has(resource)) continue
        await prisma.oauthClientResource.create({
          data: {
            id: randomUUID(),
            clientId: entry.clientId,
            resourceId: resource,
            createdAt: new Date(),
          },
        })
      }
      console.log(`updated ${entry.clientId}`)
    }

    values[entry.clientIdEnv] = entry.clientId
    values[entry.clientSecretEnv] = secret
    writeEnv(outPath, values)
  }

  console.log(`Wrote ${Object.keys(values).length} values to ${outPath}`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
