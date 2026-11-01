import { createAuth } from "@workspace/auth/server"

import { recordSessionRevocation } from "./account/session-audit"
import { recordTwoFactorChange } from "./account/two-factor-audit"
import { recordAuthAuditEvent } from "./audit/auth-audit"
import { rateLimit } from "./core/rate-limit"
import { sendResetPasswordEmail, sendVerificationEmail } from "./email"
import { ac, orgRoles } from "./organization/access"
import {
  entitlementsFor,
  resolvePlan,
  seatsFull,
} from "./organization/entitlements"
import { parseRoles } from "./organization/utils"
import { prisma } from "./prisma"
import { buildOAuthClaims, twoFactorEnrollmentRequired } from "./oauth/claims"
import {
  ACCESS_TOKEN_TTL_SECONDS,
  MCP_RESOURCE,
  REFRESH_TOKEN_REUSE_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  oauthResources,
  oauthScopes,
  trustedClientIds,
} from "./oauth/resources"
import {
  revokeOauthTokensForSession,
  revokeOauthTokensForUser,
} from "./oauth/revoke"

/**
 * GitHub/GitLab OAuth apps power optional account linking: a linked account
 * is an alternative repository credential to the personal access token a
 * user saves in their profile (see lib/integrations). The token is stored on
 * the `account` row by Better Auth.
 */
function oauthApp(
  clientId: string | undefined,
  clientSecret: string | undefined,
  scope: string[]
) {
  return clientId && clientSecret
    ? { clientId, clientSecret, scope }
    : undefined
}

const githubOauth = oauthApp(
  process.env.GITHUB_CLIENT_ID,
  process.env.GITHUB_CLIENT_SECRET,
  ["user:email", "repo"]
)
const gitlabOauth = oauthApp(
  process.env.GITLAB_CLIENT_ID,
  process.env.GITLAB_CLIENT_SECRET,
  ["read_user", "api"]
)

/**
 * Copilot is the only app that mounts Better Auth. The shared package owns the
 * configuration; this module injects the identity database, mailers, audit
 * writers, plan checks and OAuth server resources.
 */
export const auth = createAuth({
  database: prisma,
  rateLimit,
  email: { sendResetPasswordEmail, sendVerificationEmail },
  audit: {
    recordAuthAuditEvent,
    recordSessionRevocation,
    recordTwoFactorChange,
  },
  organization: {
    access: { ac, roles: orgRoles },
    parseRoles,
    resolvePlan,
    entitlementsFor,
    seatsFull,
    buildOAuthClaims,
    twoFactorEnrollmentRequired,
    onOrganizationCreated: async ({ organization, user }) => {
      await prisma.calendar.create({
        data: {
          organizationId: organization.id,
          name: "Personal",
          kind: "personal",
          color: "blue",
          members: { create: [{ userId: user.id }] },
        },
      })
    },
  },
  oauth: {
    mcpResource: MCP_RESOURCE,
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    refreshTokenReuseSeconds: REFRESH_TOKEN_REUSE_SECONDS,
    resources: oauthResources,
    scopes: oauthScopes,
    trustedClientIds,
    revokeForSession: revokeOauthTokensForSession,
    revokeForUser: revokeOauthTokensForUser,
  },
  captchaSecret: process.env.TURNSTILE_SECRET_KEY,
  github: githubOauth,
  gitlab: gitlabOauth,
})
