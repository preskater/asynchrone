import "dotenv/config"

import { createHash } from "node:crypto"

import { internalAudience, type AppKey } from "@workspace/contracts"
import { appOAuthResources } from "@workspace/contracts/server"

import { prisma } from "../lib/prisma"
import { buildOAuthClientManifest } from "../lib/oauth/clients"

/**
 * Cross-app e2e provisioning extras (#210).
 *
 * The apps' own e2e bootstraps already write every client they sign in with
 * (`apps/{copilot,projects,calendars}/e2e/bootstrap.ts`). This script is the
 * one part of the cross-app matrix that spans several apps at once, so it
 * lives in the identity owner and reuses the production manifest instead of
 * restating client definitions:
 *
 * 1. **Resource scopes.** Each per-app bootstrap writes its own half of a
 *    resource's allowed scopes (user scopes for the relying party, service
 *    scopes for Copilot) and whichever ran last would unset the other. The
 *    shared `appOAuthResources()` defines the union; rewrite it once, last.
 * 2. **Copilot → calendars.** Copilot's e2e bootstrap links its service client
 *    to projects/files/clients only. The cross-app suite also revokes,
 *    audits and exports calendars, so link that audience too.
 * 3. **The control tower's service client.** Nothing in the per-app suites
 *    needs it; the impersonation spec does, because
 *    `POST /internal/v1/admin/handoffs` requires `internal:identity:admin`.
 *
 * Run after the per-app bootstraps:
 *   E2E_CONTROL_TOWER_OAUTH_CLIENT_SECRET=… npx tsx \
 *     apps/copilot/scripts/provision-cross-app-clients.ts
 *
 * `packages/e2e/e2e/bootstrap.ts` does this for the suite.
 */

const controlTowerSecret = process.env.E2E_CONTROL_TOWER_OAUTH_CLIENT_SECRET
if (!controlTowerSecret) {
  throw new Error(
    "E2E_CONTROL_TOWER_OAUTH_CLIENT_SECRET is required (see packages/e2e/e2e/env.ts)"
  )
}

function hashClientSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url")
}

function resourceKey(identifier: string): string {
  return identifier.split(":").pop() ?? identifier
}

const now = new Date()

// 1. Resources: the union of user-delegated and service scopes per audience.
for (const resource of appOAuthResources()) {
  const key = resourceKey(resource.identifier)
  await prisma.oauthResource.upsert({
    where: { identifier: resource.identifier },
    update: { allowedScopes: resource.allowedScopes },
    create: {
      id: `resource_e2e_cross_${key}`,
      identifier: resource.identifier,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      allowedScopes: resource.allowedScopes,
      createdAt: now,
    },
  })
}

// 2 + 3. Service clients: reuse the manifest for scopes and audiences.
const manifest = buildOAuthClientManifest()
const serviceClients: { key: AppKey; secret?: string }[] = [
  { key: "copilot" },
  { key: "control-tower", secret: controlTowerSecret },
]

for (const { key, secret } of serviceClients) {
  const entry = manifest.find((candidate) => candidate.key === key)
  if (!entry) throw new Error(`No OAuth client manifest entry for ${key}`)

  const existing = await prisma.oauthClient.findUnique({
    where: { clientId: entry.clientId },
    select: { clientId: true },
  })

  if (existing) {
    await prisma.oauthClient.update({
      where: { clientId: entry.clientId },
      data: {
        disabled: false,
        clientCredentialsScopes: entry.clientCredentialsScopes,
        ...(secret ? { clientSecret: hashClientSecret(secret) } : {}),
        updatedAt: now,
      },
    })
  } else {
    if (!secret) {
      throw new Error(
        `${entry.clientId} is missing; run apps/copilot/e2e/bootstrap.ts first`
      )
    }
    await prisma.oauthClient.create({
      data: {
        id: `oauth_client_e2e_cross_${key}`,
        clientId: entry.clientId,
        clientSecret: hashClientSecret(secret),
        name: `${entry.clientName} (cross-app e2e)`,
        disabled: false,
        skipConsent: entry.skipConsent,
        enableEndSession: entry.enableEndSession,
        subjectType: "public",
        scopes: entry.scopes,
        clientCredentialsScopes: entry.clientCredentialsScopes,
        redirectUris: entry.redirectUris,
        postLogoutRedirectUris: entry.postLogoutRedirectUris,
        backchannelLogoutUri: entry.backchannelLogoutUri,
        backchannelLogoutSessionRequired:
          entry.backchannelLogoutSessionRequired,
        tokenEndpointAuthMethod: entry.tokenEndpointAuthMethod,
        applicationType: entry.applicationType,
        grantTypes: entry.grantTypes,
        responseTypes: [],
        requirePKCE: false,
        createdAt: now,
        updatedAt: now,
      },
    })
  }

  for (const identifier of entry.resources) {
    await prisma.oauthClientResource.upsert({
      where: {
        clientId_resourceId: {
          clientId: entry.clientId,
          resourceId: identifier,
        },
      },
      update: {},
      create: {
        id: `oauth_client_resource_e2e_cross_${key}_${resourceKey(identifier)}`,
        clientId: entry.clientId,
        resourceId: identifier,
        createdAt: now,
      },
    })
  }
}

console.log(
  `[cross-app e2e] normalized ${appOAuthResources().length} resources and linked ${serviceClients
    .map(({ key }) => internalAudience(key))
    .join(", ")}`
)
await prisma.$disconnect()
