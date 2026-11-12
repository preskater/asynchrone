import { getLocale, getTranslations } from "next-intl/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { ZodType } from "zod"
import type { $ZodErrorMap } from "zod/v4/core"

import type { RequestContext } from "@workspace/core/context"
import { UnauthorizedError } from "@workspace/core/errors"
import { rolesFrom } from "@workspace/organization/roles"
import { routing } from "@workspace/i18n/routing"
import { zodErrorMap } from "@workspace/i18n/zod"

import { readSessionRecord } from "@/lib/auth/session"
import { identity, readWorkspace } from "@/lib/identity"

/**
 * The actor context for a server action.
 *
 * Server actions cannot read the route params, and the client must not be able
 * to choose a tenant. The organization therefore comes from the OIDC session
 * (which the `[orgSlug]` layout keeps in sync with the URL), and the role comes
 * from the membership row — never from the request body.
 *
 * A missing session throws: an action must fail loudly rather than redirect
 * mid-mutation. Screens use `getPageContext()` instead.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const session = await readSessionRecord()
  if (!session) throw new UnauthorizedError()

  return toRequestContext(session)
}

/**
 * The actor context for a server-rendered screen.
 *
 * Layouts and pages render in parallel, so a page can start before the
 * `[orgSlug]` layout's `require*Workspace()` redirect resolves. Without a
 * session the page must send the browser to the sign-in handoff instead of
 * throwing, which would surface a 500 during the same request.
 */
export async function getPageContext(): Promise<RequestContext> {
  const session = await readSessionRecord()
  if (!session) redirect(`/${await getLocale()}/sign-in`)

  return toRequestContext(session)
}

async function toRequestContext(
  session: NonNullable<Awaited<ReturnType<typeof readSessionRecord>>>
): Promise<RequestContext> {
  const workspace = await readWorkspace(session.sid, session.organizationId)
  if (!workspace || workspace.member.clientId != null) {
    throw new UnauthorizedError()
  }

  return {
    userId: workspace.user.id,
    userName: workspace.user.name,
    userEmail: workspace.user.email,
    organizationId: workspace.organization.id,
    roles: rolesFrom(workspace.member),
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
export async function revalidateOrgPath(organizationId: string, path = "") {
  const organization = await identity
    .getOrganization(organizationId)
    .catch(() => null)
  if (!organization) return
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/${organization.slug}${path}`, "layout")
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
