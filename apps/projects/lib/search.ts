import type { SearchQuery, SearchResult } from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { parseRoles } from "@workspace/core/roles"

import { projectService } from "@/lib/projects"

function context(input: SearchQuery): RequestContext {
  return {
    userId: input.userId ?? "system",
    userName: input.userName ?? "",
    userEmail: input.userEmail ?? "system@asynchrone.space",
    organizationId: input.organizationId,
    roles: parseRoles(input.role),
  }
}

function includes(value: string | null | undefined, needle: string) {
  return Boolean(value?.toLocaleLowerCase().includes(needle))
}

/** Projects and tasks matching the query, scoped to one organization. */
export async function search(input: SearchQuery): Promise<SearchResult[]> {
  const ctx = context(input)
  const needle = input.query.toLocaleLowerCase()
  const base = `/${input.locale ?? "en"}/${input.organizationSlug ?? ""}/projects`
  const [shell, workspace] = await Promise.all([
    projectService.listShell(ctx),
    projectService.listWorkspace(ctx, { taskLimit: 500, activityLimit: 0 }),
  ])
  return [
    ...shell.projects
      .filter((project) => includes(project.name, needle))
      .map((project) => ({
        app: "projects",
        type: "project",
        id: project.id,
        title: project.name,
        url: `${base}/${project.id}`,
      })),
    ...workspace.tasks
      .filter((task) => includes(task.title, needle))
      .map((task) => ({
        app: "projects",
        type: "task",
        id: task.id,
        title: task.title,
        subtitle: task.identifier,
        url: `${base}/${task.projectId}?task=${task.id}`,
      })),
  ]
}
