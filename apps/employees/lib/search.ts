import type { SearchQuery, SearchResult } from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"

import { employeesService } from "@/lib/employees"

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
  const base = `/${input.locale ?? "en"}/${input.organizationSlug ?? ""}/employees`
  const overview = await employeesService.getOverview(ctx)
  return overview.members
    .filter(
      (member) =>
        member.name.toLocaleLowerCase().includes(needle) ||
        member.email.toLocaleLowerCase().includes(needle)
    )
    .map((member) => ({
      app: "employees",
      type: "employee",
      id: member.id,
      title: member.name,
      subtitle: member.email,
      url: `${base}?employee=${member.id}`,
    }))
}
