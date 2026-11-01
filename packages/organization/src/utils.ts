import type { OrgRole } from "./roles"

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

export function buildInviteUrl(invitationId: string) {
  const path = `/accept-invitation?id=${encodeURIComponent(invitationId)}`
  if (typeof window === "undefined") return path
  return `${window.location.origin}${path}`
}

export function parseRoles(role: string | null | undefined): OrgRole[] {
  if (!role) return []
  return role
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean) as OrgRole[]
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return `${first}${last}`.toUpperCase()
}
