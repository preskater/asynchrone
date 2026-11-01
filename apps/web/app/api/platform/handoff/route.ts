import { createHash } from "node:crypto"

import { NextResponse } from "next/server"

import { makeSignature } from "better-auth/crypto"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  IMPERSONATION_TTL_MS,
  IMPERSONATION_TTL_SECONDS,
} from "@workspace/auth/impersonation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const TOKEN_MIN_LENGTH = 32

function appBase(): string {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "")
}

function failure(reason: string) {
  return NextResponse.redirect(
    new URL(`/sign-in?error=${encodeURIComponent(reason)}`, appBase())
  )
}

/**
 * Consumes a single-use impersonation grant created by the control tower.
 *
 * The control tower never shares a cookie with this app (ADR 0018). It inserts
 * a hashed token into `PlatformHandoff`; this route claims it atomically,
 * creates a session marked with `impersonatedBy`, and signs the normal
 * Better Auth session cookie for this origin.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")
  if (!token || token.length < TOKEN_MIN_LENGTH) {
    return failure("invalid-impersonation-link")
  }

  const tokenHash = createHash("sha256").update(token).digest("hex")
  const now = new Date()

  const handoff = await prisma.platformHandoff.findUnique({
    where: { tokenHash },
  })

  if (
    !handoff ||
    handoff.kind !== "impersonate" ||
    handoff.usedAt !== null ||
    handoff.expiresAt <= now
  ) {
    return failure("invalid-impersonation-link")
  }

  // Claim before doing anything else so a replay cannot create a second session.
  const claimed = await prisma.platformHandoff.updateMany({
    where: { id: handoff.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  })
  if (claimed.count !== 1) {
    return failure("invalid-impersonation-link")
  }

  const target = await prisma.user.findUnique({
    where: { id: handoff.targetUserId },
    select: { id: true, banned: true, email: true },
  })
  if (!target || target.banned) {
    return failure("impersonation-target-unavailable")
  }

  const membership =
    (handoff.organizationId
      ? await prisma.member.findFirst({
          where: {
            userId: target.id,
            organizationId: handoff.organizationId,
            clientId: null,
          },
          select: {
            organizationId: true,
            organization: { select: { slug: true } },
          },
        })
      : null) ??
    (await prisma.member.findFirst({
      where: { userId: target.id, clientId: null },
      orderBy: { createdAt: "asc" },
      select: {
        organizationId: true,
        organization: { select: { slug: true } },
      },
    }))

  const context = await auth.$context
  const session = await context.internalAdapter.createSession(target.id, false, {
    impersonatedBy: handoff.actorId,
    activeOrganizationId: membership?.organizationId ?? null,
  })

  // Impersonation is deliberately short-lived, regardless of the customer
  // app's normal session lifetime.
  await prisma.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() + IMPERSONATION_TTL_MS) },
  })

  const actor = await prisma.user.findUnique({
    where: { id: handoff.actorId },
    select: { email: true, role: true },
  })

  try {
    await prisma.platformAuditEvent.create({
      data: {
        actorId: handoff.actorId,
        actorEmail: actor?.email ?? "unknown",
        actorRole: actor?.role ?? "unknown",
        action: "platform.impersonate.session-opened",
        targetType: "user",
        targetId: target.id,
        organizationId: handoff.organizationId ?? membership?.organizationId ?? null,
        after: { sessionId: session.id, expiresInSeconds: IMPERSONATION_TTL_SECONDS },
      },
    })
  } catch (error) {
    // Do not open an unaudited impersonation session.
    console.error("[platform] impersonation audit failed", error)
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return failure("impersonation-audit-failed")
  }

  // Opportunistic cleanup; expired grants are useless.
  await prisma.platformHandoff
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - DAY) } } })
    .catch(() => {})

  const cookie = context.authCookies.sessionToken
  const signature = await makeSignature(session.token, context.secret)
  const destination = membership
    ? `/${membership.organization.slug}`
    : "/select-organization"

  const response = NextResponse.redirect(new URL(destination, appBase()))
  response.cookies.set(cookie.name, `${session.token}.${signature}`, {
    httpOnly: cookie.attributes.httpOnly ?? true,
    sameSite:
      (cookie.attributes.sameSite as "lax" | "strict" | "none" | undefined) ??
      "lax",
    path: cookie.attributes.path ?? "/",
    secure: cookie.attributes.secure ?? process.env.NODE_ENV === "production",
    maxAge: IMPERSONATION_TTL_SECONDS,
  })

  return response
}
