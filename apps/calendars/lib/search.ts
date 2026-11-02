import type { SearchQuery, SearchResult } from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"

import { calendarService } from "@/lib/calendars"

function context(input: SearchQuery): RequestContext {
  return {
    userId: input.userId ?? "system",
    userName: input.userName ?? "",
    userEmail: input.userEmail ?? "system@asynchrone.space",
    organizationId: input.organizationId,
    role: input.role ?? "member",
  }
}

export async function search(input: SearchQuery): Promise<SearchResult[]> {
  const ctx = context(input)
  const needle = input.query.toLocaleLowerCase()
  const base = `/${input.locale ?? "en"}/${input.organizationSlug ?? ""}/calendars`
  const events = await calendarService.listEvents(ctx)
  return events
    .filter((event) => event.title.toLocaleLowerCase().includes(needle))
    .map((event) => ({
      app: "calendars",
      type: "event",
      id: event.id,
      title: event.title,
      subtitle: event.startAt,
      url: `${base}?event=${event.id}`,
    }))
}
