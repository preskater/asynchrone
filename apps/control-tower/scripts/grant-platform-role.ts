import "./load-env"

import { prisma } from "@workspace/db-control-tower"

import { PLATFORM_ROLES, type PlatformRole } from "../lib/platform/roles"

/**
 * Grants or revokes a platform role for an existing platform account.
 *
 * The control tower signs in against its own database
 * (`asynchrone_control_tower`), so the account must already exist there.
 * Platform roles are comma-separated like organization roles, so unrelated
 * values are preserved.
 *
 *   npm run grant:platform-role --workspace=control-tower -- \
 *     --email you@example.com [--role platform_support] [--revoke]
 *
 * A new operator first signs up in the customer app, then is copied into the
 * platform database with
 * `npm run cutover:control-tower --workspace=control-tower -- --user <email> --apply`.
 */

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function usage(message: string): never {
  console.error(message)
  console.error(
    "Usage: npm run grant:platform-role --workspace=control-tower -- --email <email> [--role platform_admin|platform_support] [--revoke]"
  )
  process.exit(1)
}

const email = argument("email")
const roleArgument = argument("role") ?? "platform_admin"
const revoke = process.argv.includes("--revoke")

if (!email) usage("Missing --email.")
if (!revoke && !(PLATFORM_ROLES as readonly string[]).includes(roleArgument)) {
  usage(`Unknown platform role: ${roleArgument}`)
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  })

  if (!user) {
    usage(
      `No platform account found for ${email} in the control-tower database. ` +
        "Provision it first: npm run cutover:control-tower --workspace=control-tower -- " +
        `--user ${email} --apply`
    )
  }

  const currentRoles = (user.role ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  const preserved = currentRoles.filter(
    (value) => !(PLATFORM_ROLES as readonly string[]).includes(value)
  )
  const nextRoles = revoke
    ? preserved
    : [...preserved, roleArgument as PlatformRole]

  const nextRole = nextRoles.length > 0 ? nextRoles.join(",") : null

  if (nextRole === user.role) {
    console.log(`No change: ${email} already has role "${nextRole ?? ""}".`)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: nextRole },
  })

  await prisma.platformAuditEvent.create({
    data: {
      actorId: "system",
      actorEmail: "cli:grant-platform-role",
      actorRole: "system",
      action: revoke ? "platform.role.revoke" : "platform.role.grant",
      targetType: "user",
      targetId: user.id,
      before: { role: user.role },
      after: { role: nextRole },
    },
  })

  console.log(
    `${revoke ? "Revoked" : "Granted"} platform role for ${email}: "${
      user.role ?? ""
    }" -> "${nextRole ?? ""}"`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
