import { headers } from "next/headers"

import { NotFoundError, UnauthorizedError } from "@workspace/core/errors"

import { auth } from "@/lib/auth"

import { guestService } from "./index"
import type { GuestContext, GuestUser } from "./service"

/** The signed-in user, whatever their organizations. */
export async function getGuestUser(): Promise<GuestUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const { id, name, email } = session.user
  return { id, name, email }
}

/**
 * The guest context for this request. A missing, revoked, expired or foreign
 * grant is a 404, the same answer as a project that does not exist.
 */
export async function requireGuestContext(
  grantId: string
): Promise<GuestContext> {
  const user = await getGuestUser()
  if (!user) throw new UnauthorizedError()
  const ctx = await guestService.resolve(user, grantId)
  if (!ctx) throw new NotFoundError("Project")
  return ctx
}
