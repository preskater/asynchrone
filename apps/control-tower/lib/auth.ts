import type { BetterAuthOptions } from "better-auth"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { admin, twoFactor } from "better-auth/plugins"
import { adminAc, defaultAc, userAc } from "better-auth/plugins/admin/access"
import { prisma } from "@workspace/db-control-tower"

// Validates this app's runtime configuration on first import (fail fast).
import "./env"

/**
 * A deliberately separate Better Auth instance.
 *
 * - Own database (`asynchrone_control_tower`), own origin, own secret, own
 *   cookie prefix. Platform users, sessions, accounts and TOTP rows live here,
 *   copied from the identity database by `scripts/cutover-control-tower.ts`;
 *   customer data is read through Copilot's `/internal/v1/admin/*` API.
 * - The session cookie is host-only: `advanced.crossSubDomainCookies` must
 *   never be enabled (asserted by `scripts/verify-auth-config.ts`).
 * - No `jwt` / `mcp` / `organization` plugins: the control tower does not issue
 *   tokens or act inside an organization, and it must not need the key that
 *   encrypts the shared JWKS rows.
 * - Sign-up is disabled. Accounts are provisioned by the customer app and
 *   granted a platform role out of band (`scripts/grant-platform-role.ts`).
 */
export const authConfig = {
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.CONTROL_TOWER_BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.BETTER_AUTH_URL as string],
  session: {
    expiresIn: 60 * 60 * 4,
    updateAge: 60 * 15,
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  plugins: [
    admin({
      adminRoles: ["platform_admin"],
      defaultRole: "user",
      roles: {
        platform_admin: adminAc,
        platform_support: defaultAc.newRole({
          user: ["list", "get"],
          session: ["list"],
        }),
        user: userAc,
      },
    }),
    twoFactor({ issuer: "Asynchrone Space Control Tower" }),
    nextCookies(),
  ],
  advanced: {
    cookiePrefix: "asynchrone-space-control-tower",
    // crossSubDomainCookies: intentionally absent. See ADR 0018.
  },
} satisfies BetterAuthOptions

export const auth = betterAuth(authConfig)
