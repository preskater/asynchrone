import {
  APPS,
  DomainClient,
  IdentityClient,
  NotificationClient,
  type DomainAppKey,
  type NotificationInput,
  type Workspace,
} from "@workspace/contracts"
import {
  toDirectoryEntry,
  type DirectoryEntry,
  type DirectoryMemberInput,
  type MemberDirectoryPort,
} from "@workspace/organization/directory"
import type { NotifyArgs } from "@workspace/notifications"
import { ServiceTokenClient } from "@workspace/service-auth"

import { env } from "@/lib/env"

/**
 * This app's service identity.
 *
 * Domain apps never read the identity database: the workspace gate, the member
 * directory, presence and the notification inbox all go through Copilot's
 * `/internal/v1/*` APIs with this app's client-credentials token.
 */
const tokens = new ServiceTokenClient({
  issuer: env.COPILOT_APP_URL,
  clientId: env.CALENDARS_OAUTH_CLIENT_ID,
  clientSecret: env.CALENDARS_OAUTH_CLIENT_SECRET,
})

export const identity = new IdentityClient({
  baseUrl: env.COPILOT_APP_URL,
  getToken: (request) => tokens.getToken(request),
})

const notifications = new NotificationClient({
  baseUrl: env.COPILOT_APP_URL,
  getToken: (request) => tokens.getToken(request),
})

const domainClients = new Map<DomainAppKey, DomainClient>()

/** A typed client for another domain app, using this app's credentials. */
export function domainClient(app: DomainAppKey): DomainClient {
  const existing = domainClients.get(app)
  if (existing) return existing
  const baseUrl = process.env[APPS[app].hostEnv]
  if (!baseUrl) {
    throw new Error(
      `${APPS[app].hostEnv} is required for the ${app} internal API`
    )
  }
  const client = new DomainClient({
    app,
    baseUrl,
    getToken: (request) => tokens.getToken(request),
  })
  domainClients.set(app, client)
  return client
}

/** The workspace gate payload for a verified local OIDC session. */
export function readWorkspace(
  sid: string,
  organizationId: string
): Promise<Workspace> {
  return identity.getWorkspace({ sid, organizationId })
}

function entry(member: {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  role: string
  clientId?: string | null
  createdAt?: Date
}): DirectoryEntry {
  return toDirectoryEntry(member)
}

/** The identity directory, backed by Copilot's internal API. */
export const memberDirectory: MemberDirectoryPort = {
  async list(organizationId) {
    return (await identity.listMembers(organizationId)).map(entry)
  },
  async find(organizationId, userId) {
    const members = await identity.listMembers(organizationId)
    const member = members.find((candidate) => candidate.id === userId)
    return member ? entry(member) : null
  },
  async findByEmail(organizationId, email) {
    const members = await identity.listMembers(organizationId)
    const member = members.find(
      (candidate) => candidate.email.toLowerCase() === email.toLowerCase()
    )
    return member ? entry(member) : null
  },
  async countOwners(organizationId) {
    const members = await identity.listMembers(organizationId)
    return members.filter((member) => member.role === "owner").length
  },
  async add(organizationId, input: DirectoryMemberInput) {
    return entry(
      await identity.addMember(organizationId, {
        ...input,
        role: input.role as "owner" | "admin" | "member" | "viewer" | "client",
      })
    )
  },
  async updateRole(organizationId, userId, role) {
    return entry(
      await identity.updateMemberRole(organizationId, userId, {
        role: role as "owner" | "admin" | "member" | "viewer" | "client",
      })
    )
  },
  remove(organizationId, userId) {
    return identity.removeMember(organizationId, userId)
  },
}

/**
 * Emit one inbox notification through Copilot. Notifications are secondary to
 * the mutation, so a failure is logged instead of failing the action.
 */
export async function notify(args: NotifyArgs): Promise<void> {
  if (!args.userId || args.userId === args.actorId) return
  const input: NotificationInput = {
    organizationId: args.organizationId,
    userId: args.userId,
    actorId: args.actorId,
    type: args.type,
    title: String(args.data?.title ?? args.type),
    data: args.data,
    idempotencyKey: `${args.type}:${args.organizationId}:${args.userId}:${crypto.randomUUID()}`,
  }
  try {
    await notifications.create(input)
  } catch (error) {
    console.error("[notifications] delivery failed", error)
  }
}
