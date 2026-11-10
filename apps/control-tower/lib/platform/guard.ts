import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"

import { parseTrustedIpHeaders } from "@workspace/core/trusted-ip"

import { auth } from "@/lib/auth"

import { isIpAllowed } from "./ip"
import { primaryPlatformRole, type PlatformRole } from "./roles"

export interface PlatformContext {
  userId: string
  userName: string
  userEmail: string
  role: PlatformRole
  sessionId: string
  twoFactorEnabled: boolean
}

interface SessionSnapshot {
  userId: string
  userName: string
  userEmail: string
  role: PlatformRole | null
  sessionId: string
  twoFactorEnabled: boolean
}

export class PlatformUnauthorizedError extends Error {
  constructor() {
    super("Sign in to the control tower to continue.")
    this.name = "PlatformUnauthorizedError"
  }
}

export class PlatformForbiddenError extends Error {
  constructor(message = "This account does not have a platform role.") {
    super(message)
    this.name = "PlatformForbiddenError"
  }
}

async function readSession(): Promise<SessionSnapshot | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  return {
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    role: primaryPlatformRole(session.user.role),
    sessionId: session.session.id,
    twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
  }
}

function requestIp(headerList: Headers): string | null {
  for (const name of parseTrustedIpHeaders(process.env.TRUSTED_IP_HEADERS)) {
    // The proxy appends to a hop list, so only the last entry is not
    // client-supplied: anything to its left can be forged.
    const ip = headerList.get(name)?.split(",").at(-1)?.trim()
    if (ip) return ip
  }
  return null
}

async function assertAllowedIp(surface: "page" | "action") {
  const allowlist = process.env.PLATFORM_ALLOWED_IPS
  if (!allowlist) return

  const ip = requestIp(await headers())
  if (isIpAllowed(ip, allowlist)) return

  if (surface === "action") {
    throw new PlatformForbiddenError("This network is not allowed.")
  }
  notFound()
}

/** Returns the platform context, or null for anonymous/non-platform users. */
export async function getPlatformContext(): Promise<PlatformContext | null> {
  const snapshot = await readSession()
  if (!snapshot?.role) return null
  return { ...snapshot, role: snapshot.role }
}

interface RequireOptions {
  /** `page` redirects/404s; `action` throws so server actions fail cleanly. */
  surface?: "page" | "action"
  /** Used by the two-factor setup page while the account is unenrolled. */
  allowUnverifiedTwoFactor?: boolean
}

/**
 * Role + network guard. Does not require two-factor authentication, so the
 * setup page can be reached by a freshly promoted operator.
 */
export async function requirePlatformSession(
  options: RequireOptions = {}
): Promise<PlatformContext> {
  const surface = options.surface ?? "page"
  await assertAllowedIp(surface)
  const snapshot = await readSession()

  if (!snapshot) {
    if (surface === "action") throw new PlatformUnauthorizedError()
    redirect("/sign-in")
  }

  if (!snapshot.role) {
    if (surface === "action") throw new PlatformForbiddenError()
    notFound()
  }

  return { ...snapshot, role: snapshot.role }
}

/**
 * Guard for pages and server actions. On top of the role/network checks, every
 * platform account must have enrolled a TOTP device; otherwise it is sent to
 * `/setup-2fa`.
 */
export async function requirePlatformContext(
  options: RequireOptions = {}
): Promise<PlatformContext> {
  const context = await requirePlatformSession(options)

  if (context.twoFactorEnabled || options.allowUnverifiedTwoFactor) {
    return context
  }

  if ((options.surface ?? "page") === "action") {
    throw new PlatformForbiddenError(
      "Enable two-factor authentication before performing this action."
    )
  }
  redirect("/setup-2fa")
}
