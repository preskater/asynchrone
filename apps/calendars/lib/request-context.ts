import { getTranslations } from "next-intl/server"
import { revalidatePath } from "next/cache"
import type { ZodType } from "zod"
import type { $ZodErrorMap } from "zod/v4/core"

import type { RequestContext } from "@workspace/core/context"
import { UnauthorizedError } from "@workspace/core/errors"
import { parseRoles } from "@workspace/organization/roles"
import { routing } from "@workspace/i18n/routing"
import { zodErrorMap } from "@workspace/i18n/zod"

import { readSessionRecord } from "@/lib/auth/session"
import { prisma } from "@/lib/prisma"

/**
 * The actor context for a server action.
 *
 * Server actions cannot read the route params, and the client must not be able
 * to choose a tenant. The organization therefore comes from the OIDC session
 * (which the `[orgSlug]` layout keeps in sync with the URL), and the role comes
 * from the membership row — never from the request body.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const session = await readSessionRecord()
  if (!session) throw new UnauthorizedError()

  const [copilotSession, user, member] = await Promise.all([
    prisma.session.findUnique({
      where: { id: session.sid },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true },
    }),
    prisma.member.findFirst({
      where: {
        organizationId: session.organizationId,
        userId: session.userId,
        clientId: null,
      },
      select: { role: true },
    }),
  ])

  if (!copilotSession || !user || !member) throw new UnauthorizedError()

  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    organizationId: session.organizationId,
    role: parseRoles(member.role)[0] ?? "member",
  }
}

/**
 * Refresh the tenant's subtree after a mutation. The client store applies the
 * returned entity optimistically; this keeps server-rendered data in step.
 *
 * The locale comes from the route, not from `getLocale()`: next-intl resolves
 * the locale through `next/root-params`, which server actions cannot read. Both
 * locales are revalidated instead, which is exact and only two paths.
 */
export async function revalidateOrgPath(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  })
  if (!organization) return
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/${organization.slug}`, "layout")
  }
}

/** Server-only zod parse with localized messages (see `@workspace/i18n/zod`). */
export async function parseLocalized<T>(
  schema: ZodType<T>,
  input: unknown
): Promise<T> {
  let errorMap: $ZodErrorMap | undefined
  try {
    const t = await getTranslations("Errors.validationMessages")
    errorMap = zodErrorMap((key, values) => t(key as never, values as never))
  } catch {
    errorMap = undefined
  }
  return errorMap
    ? schema.parse(input, { error: errorMap })
    : schema.parse(input)
}
