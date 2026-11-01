/**
 * Provision the first-party OAuth client the files app signs in with.
 *
 * The production path is `npm run oauth:clients --workspace=copilot -- --apply`,
 * which needs an admin session. The e2e suite cannot depend on that, so it
 * writes the same rows the admin endpoint writes, with a fixed client secret
 * (SHA-256/base64url, the storage method `@better-auth/oauth-provider` uses).
 *
 * Run before Playwright starts both apps:
 *   npm run test:e2e --workspace=files
 */
import { createHash } from "node:crypto"

import {
  APP_USER_SCOPES,
  SERVICE_SCOPES,
  internalAudience,
} from "@workspace/contracts"
import { prisma } from "@workspace/db"

import {
  E2E_OAUTH_CLIENT_ID,
  E2E_OAUTH_CLIENT_SECRET,
  E2E_FILES_URL,
} from "./env"

function hashClientSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url")
}

const filesResource = internalAudience("files")
const copilotResource = internalAudience("copilot")

const resources = [
  {
    identifier: filesResource,
    name: "Files",
    scopes: [...APP_USER_SCOPES],
  },
  {
    identifier: copilotResource,
    name: "Copilot",
    scopes: [
      SERVICE_SCOPES.identityRead,
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
    redirectUris: [`${E2E_FILES_URL}/api/auth/callback`],
    postLogoutRedirectUris: [E2E_FILES_URL],
    backchannelLogoutUri: `${E2E_FILES_URL}/api/auth/backchannel-logout`,
    updatedAt: now,
  },
  create: {
    id: "oauth_client_e2e_files",
    clientId: E2E_OAUTH_CLIENT_ID,
    clientSecret: hashClientSecret(E2E_OAUTH_CLIENT_SECRET),
    name: "Asynchrone Space files (e2e)",
    disabled: false,
    skipConsent: true,
    enableEndSession: true,
    subjectType: "public",
    scopes: [...APP_USER_SCOPES],
    clientCredentialsScopes: [
      SERVICE_SCOPES.identityRead,
      SERVICE_SCOPES.notificationsWrite,
    ],
    redirectUris: [`${E2E_FILES_URL}/api/auth/callback`],
    postLogoutRedirectUris: [E2E_FILES_URL],
    backchannelLogoutUri: `${E2E_FILES_URL}/api/auth/backchannel-logout`,
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
      id: `oauth_client_resource_e2e_files_${resource.name.toLowerCase()}`,
      clientId: client.clientId,
      resourceId: resource.identifier,
      createdAt: now,
    },
  })
}

console.log(
  `[files e2e] provisioned ${E2E_OAUTH_CLIENT_ID} for ${E2E_FILES_URL}`
)
await prisma.$disconnect()
