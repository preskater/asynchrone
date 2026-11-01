import type { SearchResult } from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"

import { calendarService } from "@/lib/calendars"
import { clientsService } from "@/lib/clients"
import { fileService } from "@/lib/files"
import { messagingService } from "@/lib/messaging"
import { projectService } from "@/lib/projects"

import type { SearchRemote } from "./fanout"

/**
 * In-process search for the domains that still share Copilot's database.
 *
 * Global search stays in Copilot, but it must read through the domain packages
 * (which own visibility, membership and tenant rules), never through a
 * Copilot HTTP route. When a domain becomes its own app, `./remotes` points at
 * its `/internal/v1/search` endpoint instead and this adapter stops offering
 * that domain (#190).
 *
 * Each searcher receives the already-authenticated context. The organization
 * id on the transport call is re-checked before any query, so a caller cannot
 * ask one workspace's adapter for another workspace's rows.
 */

const PER_DOMAIN_LIMIT = 25

function hit(
  app: string,
  type: string,
  id: string,
  title: string,
  url: string,
  subtitle?: string
): SearchResult {
  return { app, type, id, title, url, ...(subtitle ? { subtitle } : {}) }
}

function includes(haystack: string | null | undefined, needle: string) {
  return Boolean(haystack?.toLocaleLowerCase().includes(needle))
}

async function searchProjects(
  ctx: RequestContext,
  orgSlug: string,
  query: string
): Promise<SearchResult[]> {
  const [shell, workspace] = await Promise.all([
    projectService.listShell(ctx),
    projectService.listWorkspace(ctx, { taskLimit: 500, activityLimit: 0 }),
  ])
  const base = `/${orgSlug}/projects`
  return [
    ...shell.projects
      .filter((project) => includes(project.name, query))
      .map((project) =>
        hit(
          "projects",
          "project",
          project.id,
          project.name,
          `${base}/${project.id}`
        )
      ),
    ...workspace.tasks
      .filter((task) => includes(task.title, query))
      .map((task) =>
        hit(
          "projects",
          "task",
          task.id,
          task.title,
          `${base}/${task.projectId}?task=${task.id}`,
          task.identifier
        )
      ),
  ]
}

async function searchFiles(
  ctx: RequestContext,
  orgSlug: string,
  query: string
): Promise<SearchResult[]> {
  const data = await fileService.list(ctx)
  return data.files
    .filter((file) => !file.trashed && includes(file.name, query))
    .map((file) =>
      hit(
        "files",
        file.kind === "folder" ? "folder" : "file",
        file.id,
        file.name,
        `/${orgSlug}/files?file=${file.id}`,
        file.kind
      )
    )
}

async function searchMessaging(
  ctx: RequestContext,
  orgSlug: string,
  query: string
): Promise<SearchResult[]> {
  const data = await messagingService.list(ctx)
  const visible = new Set(
    data.conversations
      .filter((conversation) => conversation.memberIds.includes(ctx.userId))
      .map((conversation) => conversation.id)
  )
  const base = `/${orgSlug}/messages`
  return [
    ...data.conversations
      .filter(
        (conversation) =>
          visible.has(conversation.id) && includes(conversation.name, query)
      )
      .map((conversation) =>
        hit(
          "messages",
          "conversation",
          conversation.id,
          conversation.name,
          `${base}?conversation=${conversation.id}`
        )
      ),
    ...data.messages
      .filter(
        (message) =>
          visible.has(message.conversationId) && includes(message.body, query)
      )
      .map((message) =>
        hit(
          "messages",
          "message",
          message.id,
          message.body.slice(0, 140),
          `${base}?conversation=${message.conversationId}&message=${message.id}`
        )
      ),
  ]
}

async function searchClients(
  ctx: RequestContext,
  orgSlug: string,
  query: string
): Promise<SearchResult[]> {
  const [clients, contacts, deals] = await Promise.all([
    clientsService.listClientsPage(ctx, { limit: PER_DOMAIN_LIMIT }),
    clientsService.listContactsPage(ctx, { limit: PER_DOMAIN_LIMIT }),
    clientsService.listDealsPage(ctx, { limit: PER_DOMAIN_LIMIT }),
  ])
  return [
    ...clients.items
      .filter((client) => includes(client.name, query))
      .map((client) =>
        hit(
          "clients",
          "client",
          client.id,
          client.name,
          `/${orgSlug}/clients?client=${client.id}`,
          client.industry ?? undefined
        )
      ),
    ...contacts.items
      .filter((contact) =>
        includes(`${contact.firstName} ${contact.lastName}`, query)
      )
      .map((contact) =>
        hit(
          "clients",
          "contact",
          contact.id,
          `${contact.firstName} ${contact.lastName}`.trim(),
          `/${orgSlug}/contacts?contact=${contact.id}`,
          contact.email ?? undefined
        )
      ),
    ...deals.items
      .filter((deal) => includes(deal.name, query))
      .map((deal) =>
        hit(
          "clients",
          "deal",
          deal.id,
          deal.name,
          `/${orgSlug}/deals?deal=${deal.id}`,
          deal.status
        )
      ),
  ]
}

async function searchCalendars(
  ctx: RequestContext,
  orgSlug: string,
  query: string
): Promise<SearchResult[]> {
  // `listEvents` is read-only; `list` would create a default calendar the
  // first time a member searches an empty workspace.
  const events = await calendarService.listEvents(ctx)
  return events
    .filter((event) => includes(event.title, query))
    .map((event) =>
      hit(
        "calendars",
        "event",
        event.id,
        event.title,
        `/${orgSlug}/calendars?event=${event.id}`,
        event.startAt
      )
    )
}

type Searcher = {
  app: string
  search: (
    ctx: RequestContext,
    orgSlug: string,
    query: string
  ) => Promise<SearchResult[]>
}

const SEARCHERS: Searcher[] = [
  { app: "projects", search: searchProjects },
  { app: "files", search: searchFiles },
  { app: "messages", search: searchMessaging },
  { app: "clients", search: searchClients },
  { app: "calendars", search: searchCalendars },
]

/**
 * Search participants backed by the domain packages, for every domain that is
 * not configured as a separate app. The transport signature mirrors
 * search client so `searchAcrossApps` merges both kinds identically.
 */
export function inProcessSearchRemotes(
  ctx: RequestContext,
  orgSlug: string
): SearchRemote[] {
  return SEARCHERS.map(({ app, search }) => ({
    app,
    client: {
      search: async (organizationId, query, limit = 20) => {
        if (organizationId !== ctx.organizationId) return { results: [] }
        const needle = query.trim().toLocaleLowerCase()
        if (!needle) return { results: [] }
        const results = await search(ctx, orgSlug, needle)
        return { results: results.slice(0, limit) }
      },
    },
  }))
}
