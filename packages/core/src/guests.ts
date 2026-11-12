/**
 * External collaborators (project guests, ADR 0041).
 *
 * A guest is a user from another organization (or none) holding a grant on
 * one project of the host organization. The grant is not a membership: it
 * never takes a seat, never appears in `member`, and every guest request is
 * resolved from the grant, not from the session's active organization.
 *
 * Dependency-free so Copilot (which owns the grant) and the projects app
 * (which enforces it on every row) apply the same vocabulary.
 */

export const GUEST_CAPABILITIES = [
  "project:read",
  "task:read",
  "task:comment",
  "task:write",
  "message:read",
  "message:write",
] as const

export type GuestCapability = (typeof GUEST_CAPABILITIES)[number]

/** Every grant can open its project and read its tasks. */
export const BASE_GUEST_CAPABILITIES: readonly GuestCapability[] = [
  "project:read",
  "task:read",
]

export const DEFAULT_GUEST_CAPABILITIES: readonly GuestCapability[] = [
  ...BASE_GUEST_CAPABILITIES,
  "task:comment",
]

/** Expiry choices offered when inviting, in days. */
export const GUEST_EXPIRY_DAYS = [7, 30, 90] as const

export type GuestStatus = "invited" | "active" | "revoked"

function isGuestCapability(value: string): value is GuestCapability {
  return (GUEST_CAPABILITIES as readonly string[]).includes(value)
}

/**
 * The known capabilities in a stored value (`"task:comment,message:read"`)
 * or list, always including the base read access, in canonical order.
 */
export function parseGuestCapabilities(
  value: string | readonly string[] | null | undefined
): GuestCapability[] {
  const parts = (Array.isArray(value) ? value : [value ?? ""])
    .flatMap((entry: string) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(isGuestCapability)
  const held = new Set<GuestCapability>([...BASE_GUEST_CAPABILITIES, ...parts])
  return GUEST_CAPABILITIES.filter((capability) => held.has(capability))
}

export function guestCan(
  holder: { capabilities: readonly string[] },
  capability: GuestCapability
): boolean {
  return holder.capabilities.includes(capability)
}

/**
 * Whether a grant lets this user in right now. An expired grant behaves
 * exactly like a revoked one; an unaccepted invitation grants nothing.
 */
export function guestGrantUsable(
  grant: { status: string; userId: string | null; expiresAt: Date },
  userId: string,
  now: Date = new Date()
): boolean {
  return (
    grant.status === "active" &&
    grant.userId === userId &&
    grant.expiresAt.getTime() > now.getTime()
  )
}

/** Whether an invitation can still be accepted. */
export function guestInvitationOpen(
  grant: { status: string; expiresAt: Date },
  now: Date = new Date()
): boolean {
  return grant.status === "invited" && grant.expiresAt.getTime() > now.getTime()
}
