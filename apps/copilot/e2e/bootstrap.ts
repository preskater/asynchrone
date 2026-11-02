/**
 * Provision Copilot's client-credentials client for the e2e suite.
 *
 * The assistant, MCP tools and portal now call the domain apps' internal APIs.
 * Those routes verify a token minted for `asynchrone-copilot`; this script
 * writes the same row the production provisioning script writes.
 *
 * Run before Playwright:
 *   npm run test:e2e --workspace=copilot
 */
import { createHash } from "node:crypto"

import {
  APP_USER_SCOPES,
  SERVICE_SCOPES,
  internalAudience,
} from "@workspace/contracts"
import { prisma } from "@workspace/db-identity"

import {
  E2E_COPILOT_OAUTH_CLIENT_ID,
  E2E_COPILOT_OAUTH_CLIENT_SECRET,
  E2E_DOMAIN_APPS,
} from "./internal-domain"

function hashClientSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url")
}

const domainScopes = [
  SERVICE_SCOPES.identityRead,
  SERVICE_SCOPES.identityWrite,
  SERVICE_SCOPES.notificationsWrite,
  SERVICE_SCOPES.domainRead,
  SERVICE_SCOPES.domainWrite,
  SERVICE_SCOPES.auditRead,
  SERVICE_SCOPES.searchRead,
  SERVICE_SCOPES.exportRead,
  SERVICE_SCOPES.deleteWrite,
]

const resources = [
  ...E2E_DOMAIN_APPS.map((app) => ({
    identifier: internalAudience(app.key),
    name: app.key.charAt(0).toUpperCase() + app.key.slice(1),
    scopes: domainScopes,
  })),
  {
    identifier: internalAudience("copilot"),
    name: "Copilot",
    scopes: domainScopes,
  },
]

const now = new Date()

for (const resource of resources) {
  await prisma.oauthResource.upsert({
    where: { identifier: resource.identifier },
    update: { allowedScopes: resource.scopes },
    create: {
      id: `resource_e2e_${resource.name.toLowerCase()}`,
      identifier: resource.identifier,
      name: resource.name,
      allowedScopes: resource.scopes,
      createdAt: now,
    },
  })
}

const client = await prisma.oauthClient.upsert({
  where: { clientId: E2E_COPILOT_OAUTH_CLIENT_ID },
  update: {
    clientSecret: hashClientSecret(E2E_COPILOT_OAUTH_CLIENT_SECRET),
    clientCredentialsScopes: domainScopes,
    scopes: [],
    disabled: false,
    updatedAt: now,
  },
  create: {
    id: "oauth_client_e2e_copilot",
    clientId: E2E_COPILOT_OAUTH_CLIENT_ID,
    clientSecret: hashClientSecret(E2E_COPILOT_OAUTH_CLIENT_SECRET),
    name: "Asynchrone Space Copilot service (e2e)",
    disabled: false,
    skipConsent: true,
    enableEndSession: false,
    subjectType: "public",
    scopes: [],
    clientCredentialsScopes: domainScopes,
    redirectUris: [],
    postLogoutRedirectUris: [],
    tokenEndpointAuthMethod: "client_secret_basic",
    applicationType: "web",
    grantTypes: ["client_credentials"],
    responseTypes: [],
    requirePKCE: false,
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
      id: `oauth_client_resource_e2e_${client.clientId}_${resource.name.toLowerCase()}`,
      clientId: client.clientId,
      resourceId: resource.identifier,
      createdAt: now,
    },
  })
}

for (const app of E2E_DOMAIN_APPS) {
  const appClient = await prisma.oauthClient.upsert({
    where: { clientId: app.clientId },
    update: {
      clientSecret: hashClientSecret(app.clientSecret),
      clientCredentialsScopes: [
        SERVICE_SCOPES.identityRead,
        SERVICE_SCOPES.identityWrite,
        SERVICE_SCOPES.notificationsWrite,
        SERVICE_SCOPES.domainRead,
        SERVICE_SCOPES.domainWrite,
      ],
      disabled: false,
      updatedAt: now,
    },
    create: {
      id: `oauth_client_e2e_${app.clientId}`,
      clientId: app.clientId,
      clientSecret: hashClientSecret(app.clientSecret),
      name: `Asynchrone Space ${app.key} (e2e)`,
      disabled: false,
      skipConsent: true,
      enableEndSession: true,
      subjectType: "public",
      scopes: [...APP_USER_SCOPES],
      clientCredentialsScopes: [
        SERVICE_SCOPES.identityRead,
        SERVICE_SCOPES.identityWrite,
        SERVICE_SCOPES.notificationsWrite,
        SERVICE_SCOPES.domainRead,
        SERVICE_SCOPES.domainWrite,
      ],
      redirectUris: [`${app.url}/api/auth/callback`],
      postLogoutRedirectUris: [app.url],
      backchannelLogoutUri: `${app.url}/api/auth/backchannel-logout`,
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
          clientId: appClient.clientId,
          resourceId: resource.identifier,
        },
      },
      update: {},
      create: {
        id: `oauth_client_resource_e2e_${appClient.clientId}_${resource.identifier.replace(
          /[^a-z0-9]+/gi,
          "_"
        )}`,
        clientId: appClient.clientId,
        resourceId: resource.identifier,
        createdAt: now,
      },
    })
  }
}

console.log(
  `[copilot e2e] provisioned ${E2E_COPILOT_OAUTH_CLIENT_ID} for ${resources.length} domain audiences`
)
await prisma.$disconnect()
