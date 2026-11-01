import { internalAudience } from "@workspace/contracts"
import {
  normalizeConfig,
  PrismaOidcSessionStore,
  type OidcConfig,
} from "@workspace/oidc"

import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"

/**
 * The relying-party configuration for this app.
 *
 * Copilot is the issuer and the audience is the files resource, so a token
 * minted for another workspace app is rejected by the JWKS verification in
 * `@workspace/oidc`. Cookies are host-only: `__Host-asynchrone_session` when
 * served over HTTPS, unprefixed on local HTTP.
 */
export const oidcConfig: OidcConfig = {
  issuer: env.COPILOT_APP_URL,
  clientId: env.FILES_OAUTH_CLIENT_ID,
  clientSecret: env.FILES_OAUTH_CLIENT_SECRET,
  redirectUri: `${env.FILES_APP_URL}/api/auth/callback`,
  resource: internalAudience("files"),
  secureCookies: env.FILES_APP_URL.startsWith("https://"),
}

/** Names of the host-only cookies this app sets. */
export const oidcCookies = normalizeConfig(oidcConfig)

/** The local session cookie (`__Host-asynchrone_session` when secure). */
export const sessionCookieName = oidcCookies.sessionCookieName

/** The app-local session store: one row per local sign-in. */
export const sessionStore = new PrismaOidcSessionStore(prisma.oidcSession)
