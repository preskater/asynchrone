/** Fixed ids shared by every database: cross-database references have no FK. */
export const ORG_ID = "demo_org"
export const ORG_SLUG = "demo"

export const USERS = {
  owner: {
    id: "demo_user_owner",
    name: "Camille Durand",
    email: "demo@example.com",
    role: "owner",
  },
  admin: {
    id: "demo_user_admin",
    name: "Noah Bernard",
    email: "demo.admin@example.com",
    role: "admin",
  },
  member: {
    id: "demo_user_member",
    name: "Lina Petit",
    email: "demo.member@example.com",
    role: "member",
  },
  designer: {
    id: "demo_user_designer",
    name: "Hugo Moreau",
    email: "demo.designer@example.com",
    role: "member",
  },
  viewer: {
    id: "demo_user_viewer",
    name: "Sacha Roux",
    email: "demo.viewer@example.com",
    role: "viewer",
  },
  client: {
    id: "demo_user_client",
    name: "Alex Fontaine",
    email: "demo.client@example.com",
    role: "client",
  },
} as const

export const { owner, admin, member, designer, viewer, client } = USERS

/** Everyone who works in the internal workspace (not the portal account). */
export const TEAM = [owner, admin, member, designer, viewer]

export const CLIENT_ACME = "demo_client_acme"
export const CLIENT_GLOBEX = "demo_client_globex"
export const CLIENT_INITECH = "demo_client_initech"

export const PROJECT_WEBSITE = "demo_project_website"
export const PROJECT_MOBILE = "demo_project_mobile"
export const PROJECT_INTERNAL = "demo_project_internal"

/** A date `days` from today (UTC) at `hour`, so a fresh seed always looks current. */
export function day(days: number, hour = 0): Date {
  const date = new Date()
  date.setUTCHours(hour, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + days)
  return date
}
