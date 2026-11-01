import "./load-env"

import { createHash, randomBytes } from "node:crypto"

import { prisma } from "@workspace/db-control-tower"

import { auth } from "../lib/auth"
import { isIpAllowed } from "../lib/platform/ip"
import { parsePlatformRoles, primaryPlatformRole } from "../lib/platform/roles"

/**
 * Manual check for the control-tower authorization model (needs a live DB).
 *
 *   npm run verify:platform-authorization --workspace=control-tower
 *
 * It covers role resolution, the optional IP allowlist, the single-use
 * handoff guarantee, the cutover invariant (the platform database only holds
 * accounts that have a platform role) and a real Better Auth sign-in against
 * `asynchrone_control_tower`. HTTP-level checks (404 for non-platform users,
 * 2FA gate) are covered by the smoke flows in the PR.
 */

let failures = 0

function check(condition: unknown, message: string) {
  if (condition) {
    console.log(`✓ ${message}`)
    return
  }
  failures++
  console.error(`✗ ${message}`)
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

async function main() {
  // Customer roles must never be mistaken for platform roles.
  check(
    primaryPlatformRole("owner") === null,
    "customer owner is not a platform user"
  )
  check(
    primaryPlatformRole("admin") === null,
    "organization admin is not a platform user"
  )
  check(primaryPlatformRole("member") === null, "member is not a platform user")
  check(
    primaryPlatformRole("platform_admin") === "platform_admin",
    "platform admin is recognized"
  )
  check(
    primaryPlatformRole("member,platform_support") === "platform_support",
    "platform support is recognized inside a role list"
  )
  check(
    parsePlatformRoles("owner,platform_admin").length === 1,
    "non-platform roles are filtered out"
  )

  // Network allowlist.
  check(
    isIpAllowed("203.0.113.9", "203.0.113.0/24"),
    "IP inside the CIDR is allowed"
  )
  check(
    !isIpAllowed("198.51.100.9", "203.0.113.0/24"),
    "IP outside the CIDR is rejected"
  )
  check(isIpAllowed("1.2.3.4", ""), "an empty allowlist allows every IP")
  check(
    !isIpAllowed(null, "1.2.3.4"),
    "a missing IP is rejected when a list is set"
  )

  // Single-use handoff.
  const now = Date.now()
  const handoff = await prisma.platformHandoff.create({
    data: {
      tokenHash: hashToken(randomBytes(32).toString("hex")),
      actorId: "verify-actor",
      targetUserId: "verify-target",
      expiresAt: new Date(now + 60_000),
    },
  })

  const first = await prisma.platformHandoff.updateMany({
    where: { id: handoff.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  const replay = await prisma.platformHandoff.updateMany({
    where: { id: handoff.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  check(
    first.count === 1 && replay.count === 0,
    "a handoff token can be claimed exactly once"
  )

  const expired = await prisma.platformHandoff.create({
    data: {
      tokenHash: hashToken(randomBytes(32).toString("hex")),
      actorId: "verify-actor",
      targetUserId: "verify-target",
      expiresAt: new Date(now - 1_000),
    },
  })
  const expiredClaim = await prisma.platformHandoff.updateMany({
    where: { id: expired.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  check(expiredClaim.count === 0, "an expired handoff cannot be claimed")

  await prisma.platformHandoff.deleteMany({
    where: { id: { in: [handoff.id, expired.id] } },
  })

  // Cutover invariant: the platform database is not a copy of the customer
  // directory. Every account it holds must carry a platform role.
  const accounts = await prisma.user.findMany({
    select: { email: true, role: true },
  })
  const nonPlatform = accounts.filter(
    (account) => primaryPlatformRole(account.role) === null
  )
  check(
    nonPlatform.length === 0,
    `every platform account has a platform role (${accounts.length} account${
      accounts.length === 1 ? "" : "s"
    }${nonPlatform.length > 0 ? `, offenders: ${nonPlatform.map((a) => a.email).join(", ")}` : ""})`
  )

  // The control tower must be able to sign in with nothing but its own
  // database. Create a throwaway operator, sign in through Better Auth and
  // assert the session row landed in `asynchrone_control_tower`.
  const password = "verify-control-tower-sign-in-password"
  const email = `verify-signin-${Date.now()}@example.com`
  const context = await auth.$context
  const operator = await context.internalAdapter.createUser(
    {
      email,
      name: "Verify Sign-in",
      emailVerified: true,
      role: "platform_support",
    },
    { method: "email-password" }
  )
  try {
    await context.internalAdapter.createAccount({
      userId: operator.id,
      providerId: "credential",
      accountId: operator.id,
      password: await context.password.hash(password),
    })
    const signedIn = await auth.api.signInEmail({ body: { email, password } })
    const sessions = await prisma.session.count({
      where: { userId: operator.id },
    })
    check(
      signedIn.user.id === operator.id && sessions === 1,
      "Better Auth signs in against the control-tower database"
    )
  } finally {
    await prisma.session.deleteMany({ where: { userId: operator.id } })
    await prisma.account.deleteMany({ where: { userId: operator.id } })
    await prisma.user.delete({ where: { id: operator.id } })
  }

  if (failures > 0) {
    console.error(`\n${failures} platform authorization check(s) failed.`)
    process.exit(1)
  }
  console.log("\nPlatform authorization checks passed.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
