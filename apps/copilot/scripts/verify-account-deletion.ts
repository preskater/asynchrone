import "dotenv/config"

import { randomUUID } from "node:crypto"

import {
  DELETED_USER_NAME,
  deleteAccount,
} from "../lib/account/deletion-service"
import { prisma } from "../lib/prisma"

/**
 * Manual check for personal account deletion (issue #88), against throwaway
 * users and organizations in the configured database: the sole-owner and
 * platform-operator guards, anonymization, removed credentials, kept content
 * and employee rows, and the audit trail. Password and impersonation checks live in
 * the server action and are covered by the manual UI test. Run with:
 *
 *   npm run verify:account-deletion
 */

let failures = 0

function check(ok: boolean, message: string) {
  if (!ok) failures++
  console.log(`${ok ? "✓" : "✗ FAILED"} ${message}`)
}

/** The error code, or "ok" when the call succeeded. */
async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    return "ok"
  } catch (error) {
    return (error as { code?: string }).code ?? String(error)
  }
}

async function main() {
  const suffix = randomUUID().slice(0, 8)
  const user = (key: string) => ({
    id: `user_account_${key}_${suffix}`,
    email: `${key}-${suffix}@account.verify`,
  })
  const users = {
    leaver: user("leaver"),
    owner: user("owner"),
    operator: user("operator"),
  }
  const orgs = {
    shared: `org_account_shared_${suffix}`, // owner + leaver as admin
    solo: `org_account_solo_${suffix}`, // leaver is the only owner
  }
  const start = new Date()

  try {
    for (const [key, { id, email }] of Object.entries(users)) {
      await prisma.user.create({
        data: {
          id,
          name: `Name ${key}`,
          email,
          emailVerified: true,
          image: "https://example.test/avatar.png",
          role: key === "operator" ? "platform_support" : "user",
          customerTwoFactorEnabled: true,
        },
      })
      await prisma.customerTwoFactor.create({
        data: { userId: id, secret: "secret", backupCodes: "codes" },
      })
      await prisma.account.create({
        data: {
          id: `account_${id}`,
          accountId: id,
          providerId: "credential",
          userId: id,
          password: "hash",
          createdAt: start,
          updatedAt: start,
        },
      })
      await prisma.session.create({
        data: {
          id: `session_${id}`,
          token: `token_${id}`,
          userId: id,
          expiresAt: new Date(start.getTime() + 60_000),
          createdAt: start,
          updatedAt: start,
        },
      })
    }
    for (const [key, id] of Object.entries(orgs)) {
      await prisma.organization.create({
        data: {
          id,
          name: `Account ${key}`,
          slug: id.replaceAll("_", "-"),
          createdAt: start,
        },
      })
    }
    const memberships = [
      [orgs.shared, users.owner, "owner"],
      [orgs.shared, users.leaver, "admin"],
      [orgs.solo, users.leaver, "owner"],
    ] as const
    for (const [organizationId, { id }, role] of memberships) {
      await prisma.member.create({
        data: {
          id: `member_${id}_${organizationId}`,
          organizationId,
          userId: id,
          role,
          createdAt: start,
        },
      })
    }
    await prisma.verification.create({
      data: {
        id: `verification_${suffix}`,
        identifier: `reset-password:${suffix}`,
        value: users.leaver.id,
        expiresAt: new Date(start.getTime() + 60_000),
      },
    })
    await prisma.notification.create({
      data: {
        organizationId: orgs.shared,
        userId: users.leaver.id,
        type: "test",
      },
    })
    const conversation = await prisma.conversation.create({
      data: { organizationId: orgs.shared, name: "general" },
    })
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        authorId: users.leaver.id,
        body: "kept",
      },
    })

    // Guards
    check(
      (await outcome(() => deleteAccount(users.leaver.id, "wrong@x.test"))) ===
        "account_confirmation_mismatch",
      "a wrong confirmation email is refused"
    )
    check(
      (await outcome(() =>
        deleteAccount(users.operator.id, users.operator.email)
      )) === "account_platform_operator",
      "a platform operator cannot delete their account"
    )
    check(
      (await outcome(() =>
        deleteAccount(users.leaver.id, users.leaver.email)
      )) === "account_sole_owner",
      "the only owner of an organization is blocked"
    )
    await prisma.organization.update({
      where: { id: orgs.solo },
      data: { deletionScheduledAt: new Date(start.getTime() + 60_000) },
    })

    // Deletion
    check(
      (await outcome(() =>
        deleteAccount(users.leaver.id, users.leaver.email.toUpperCase())
      )) === "ok",
      "deletion succeeds once the solo organization is scheduled for deletion"
    )
    const deleted = await prisma.user.findUnique({
      where: { id: users.leaver.id },
    })
    check(
      deleted?.name === DELETED_USER_NAME &&
        deleted.email === `deleted-${users.leaver.id}@deleted.invalid` &&
        deleted.image === null &&
        deleted.banned === true &&
        deleted.customerTwoFactorEnabled === false,
      "the user row is anonymized and banned"
    )
    const counts = await Promise.all([
      prisma.session.count({ where: { userId: users.leaver.id } }),
      prisma.account.count({ where: { userId: users.leaver.id } }),
      prisma.member.count({ where: { userId: users.leaver.id } }),
      prisma.verification.count({ where: { value: users.leaver.id } }),
      prisma.notification.count({ where: { userId: users.leaver.id } }),
      prisma.customerTwoFactor.count({ where: { userId: users.leaver.id } }),
    ])
    check(
      counts.every((count) => count === 0),
      `sessions, sign-in methods, memberships, reset tokens, notifications and two-factor secrets are gone (${counts.join("/")})`
    )
    check(
      (await prisma.message.count({ where: { id: message.id } })) === 1,
      "content the user wrote is kept"
    )
    check(
      (await prisma.member.count({ where: { userId: users.owner.id } })) ===
        1 &&
        (await prisma.session.count({ where: { userId: users.owner.id } })) ===
          1,
      "other users are untouched"
    )
    check(
      (await prisma.auditLog.count({
        where: {
          entityId: users.leaver.id,
          action: "member.account_deleted",
        },
      })) === 2,
      "each organization left gets an AuditLog row"
    )
    const event = await prisma.platformAuditEvent.findFirst({
      where: { targetId: users.leaver.id, action: "user.deleted" },
    })
    check(
      event !== null && event.actorEmail !== users.leaver.email,
      "a PlatformAuditEvent records the deletion without the real email"
    )

    // The address is free again.
    const again = await outcome(() =>
      prisma.user.create({
        data: {
          id: `user_account_again_${suffix}`,
          name: "Again",
          email: users.leaver.email,
        },
      })
    )
    check(again === "ok", "the same email address can sign up again")
  } finally {
    const ids = [
      ...Object.values(users).map(({ id }) => id),
      `user_account_again_${suffix}`,
    ]
    await prisma.organization
      .deleteMany({ where: { id: { in: Object.values(orgs) } } })
      .catch(() => {})
    await prisma.platformAuditEvent
      .deleteMany({ where: { targetId: { in: ids } } })
      .catch(() => {})
    await prisma.verification
      .deleteMany({ where: { id: `verification_${suffix}` } })
      .catch(() => {})
    await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {})
    await prisma.$disconnect()
  }

  if (failures > 0) {
    console.error(`\n${failures} account deletion check(s) failed`)
    process.exitCode = 1
  } else {
    console.log("\nAll account deletion checks passed")
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
