import type { SearchQuery, SearchResult } from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { parseRoles } from "@workspace/core/roles"

import { clientsService } from "@/lib/clients"

function context(input: SearchQuery): RequestContext {
  return {
    userId: input.userId ?? "system",
    userName: input.userName ?? "",
    userEmail: input.userEmail ?? "system@asynchrone.space",
    organizationId: input.organizationId,
    roles: parseRoles(input.role),
  }
}

export async function search(input: SearchQuery): Promise<SearchResult[]> {
  const ctx = context(input)
  const needle = input.query.toLocaleLowerCase()
  const base = `/${input.locale ?? "en"}/${input.organizationSlug ?? ""}`
  const [clients, contacts, deals] = await Promise.all([
    clientsService.listClientsPage(ctx, { limit: 25 }),
    clientsService.listContactsPage(ctx, { limit: 25 }),
    clientsService.listDealsPage(ctx, { limit: 25 }),
  ])
  return [
    ...clients.items
      .filter((client) => client.name.toLocaleLowerCase().includes(needle))
      .map((client) => ({
        app: "clients",
        type: "client",
        id: client.id,
        title: client.name,
        subtitle: client.industry ?? undefined,
        url: `${base}/clients?client=${client.id}`,
      })),
    ...contacts.items
      .filter((contact) =>
        `${contact.firstName} ${contact.lastName}`
          .toLocaleLowerCase()
          .includes(needle)
      )
      .map((contact) => ({
        app: "clients",
        type: "contact",
        id: contact.id,
        title: `${contact.firstName} ${contact.lastName}`.trim(),
        subtitle: contact.email ?? undefined,
        url: `${base}/contacts?contact=${contact.id}`,
      })),
    ...deals.items
      .filter((deal) => deal.name.toLocaleLowerCase().includes(needle))
      .map((deal) => ({
        app: "clients",
        type: "deal",
        id: deal.id,
        title: deal.name,
        subtitle: deal.status,
        url: `${base}/deals?deal=${deal.id}`,
      })),
  ]
}
