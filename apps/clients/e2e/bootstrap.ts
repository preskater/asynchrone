/**
 * Provision the first-party OAuth client the clients app signs in with.
 *
 * The production path is `npm run oauth:clients --workspace=copilot -- --apply`,
 * which needs an admin session. The e2e suite cannot depend on that, so it
 * writes the same rows the admin endpoint writes, with a fixed client secret
 * (SHA-256/base64url, the storage method `@better-auth/oauth-provider` uses).
 *
 * Run before Playwright starts both apps:
 *   npm run test:e2e --workspace=clients
 */
import { createHash } from "node:crypto"

import {
  APP_USER_SCOPES,
  SERVICE_SCOPES,
  internalAudience,
} from "@workspace/contracts"
import { prisma } from "@workspace/db-identity"

import {
  E2E_OAUTH_CLIENT_ID,
  E2E_OAUTH_CLIENT_SECRET,
  E2E_CLIENTS_URL,
} from "./env"

function hashClientSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url")
}

const clientsResource = internalAudience("clients")
const copilotResource = internalAudience("copilot")

const crossAudiences = ["projects", "files"] as const

const resources = [
  {
    identifier: clientsResource,
    name: "Clients",
    scopes: [...APP_USER_SCOPES],
  },
  {
    identifier: copilotResource,
    name: "Copilot",
    scopes: [
      SERVICE_SCOPES.identityRead,
      SERVICE_SCOPES.identityWrite,
      SERVICE_SCOPES.notificationsWrite,
      SERVICE_SCOPES.identityAdmin,
      SERVICE_SCOPES.auditRead,
      SERVICE_SCOPES.auditWrite,
      SERVICE_SCOPES.exportRead,
      SERVICE_SCOPES.deleteWrite,
      SERVICE_SCOPES.searchRead,
      SERVICE_SCOPES.domainRead,
      SERVICE_SCOPES.domainWrite,
    ],
  },
]

for (const target of crossAudiences) {
  resources.push({
    identifier: internalAudience(target),
    name: target,
    scopes: [
      SERVICE_SCOPES.domainRead,
      ...(crossAudiences.length ? [SERVICE_SCOPES.domainWrite] : []),
    ],
  })
}

const now = new Date()

for (const resource of resources) {
  await prisma.oauthResource.upsert({
    where: { identifier: resource.identifier },
    update: { allowedScopes: resource.scopes },
    create: {
      id: `resource_${resource.name.toLowerCase()}`,
      identifier: resource.identifier,
      name: resource.name,
      allowedScopes: resource.scopes,
      createdAt: now,
    },
  })
}

const client = await prisma.oauthClient.upsert({
  where: { clientId: E2E_OAUTH_CLIENT_ID },
  update: {
    clientSecret: hashClientSecret(E2E_OAUTH_CLIENT_SECRET),
    redirectUris: [`${E2E_CLIENTS_URL}/api/auth/callback`],
    postLogoutRedirectUris: [E2E_CLIENTS_URL],
    backchannelLogoutUri: `${E2E_CLIENTS_URL}/api/auth/backchannel-logout`,
    updatedAt: now,
  },
  create: {
    id: "oauth_client_e2e_clients",
    clientId: E2E_OAUTH_CLIENT_ID,
    clientSecret: hashClientSecret(E2E_OAUTH_CLIENT_SECRET),
    name: "Asynchrone Space clients (e2e)",
    disabled: false,
    skipConsent: true,
    enableEndSession: true,
    subjectType: "public",
    scopes: [...APP_USER_SCOPES],
    clientCredentialsScopes: [
      SERVICE_SCOPES.identityRead,
      SERVICE_SCOPES.identityWrite,
      SERVICE_SCOPES.notificationsWrite,
    ],
    redirectUris: [`${E2E_CLIENTS_URL}/api/auth/callback`],
    postLogoutRedirectUris: [E2E_CLIENTS_URL],
    backchannelLogoutUri: `${E2E_CLIENTS_URL}/api/auth/backchannel-logout`,
    backchannelLogoutSessionRequired: true,
    tokenEndpointAuthMethod: "client_secret_basic",
    applicationType: "web",
    grantTypes: ["authorization_code", "refresh_token", "client_credentials"],
    responseTypes: ["code"],
    requirePKCE: true,
    createdAt: now,
    updatedAt: now,
  },
})

for (const resource of resources) {
  await prisma.oauthClientResource.upsert({
    where: {
      clientId_resourceId: {
        clientId: client.clientId,
        resourceId: resource.identifier,
      },
    },
    update: {},
    create: {
      // The id is global: both domain suites link their client to the shared
      // Copilot resource, so the client id must be part of it.
      id: `oauth_client_resource_e2e_${client.clientId}_${resource.identifier.replace(/[^a-z0-9]+/gi, "_")}`,
      clientId: client.clientId,
      resourceId: resource.identifier,
      createdAt: now,
    },
  })
}

console.log(
  `[clients e2e] provisioned ${E2E_OAUTH_CLIENT_ID} for ${E2E_CLIENTS_URL}`
)
await prisma.$disconnect()
