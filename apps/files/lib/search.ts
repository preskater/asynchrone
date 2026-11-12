import type { SearchQuery, SearchResult } from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { parseRoles } from "@workspace/core/roles"

import { fileService } from "@/lib/files"

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
  const base = `/${input.locale ?? "en"}/${input.organizationSlug ?? ""}/files`
  const data = await fileService.list(ctx)
  return data.files
    .filter(
      (file) => !file.trashed && file.name.toLocaleLowerCase().includes(needle)
    )
    .map((file) => ({
      app: "files",
      type: file.kind === "folder" ? "folder" : "file",
      id: file.id,
      title: file.name,
      subtitle: file.kind,
      url: `${base}?file=${file.id}`,
    }))
}
