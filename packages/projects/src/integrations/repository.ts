import type { ProjectDb } from "../db"
import type { RepositoryProvider } from "./types"

export class RepositoryConnectionRepository {
  constructor(private readonly db: ProjectDb) {}

  findById(id: string) {
    return this.db.repositoryConnection.findUnique({ where: { id } })
  }

  findByProject(organizationId: string, projectId: string) {
    return this.db.repositoryConnection.findFirst({
      where: { organizationId, projectId },
    })
  }

  findByRepo(
    organizationId: string,
    provider: RepositoryProvider,
    owner: string,
    repo: string
  ) {
    return this.db.repositoryConnection.findFirst({
      where: { organizationId, provider, owner, repo },
    })
  }

  listAll() {
    return this.db.repositoryConnection.findMany({
      orderBy: { createdAt: "asc" },
    })
  }

  create(data: {
    organizationId: string
    projectId: string
    provider: RepositoryProvider
    baseUrl: string | null
    owner: string
    repo: string
    repoUrl: string
    webhookSecret: string
    createdById: string
  }) {
    return this.db.repositoryConnection.create({ data })
  }

  update(
    id: string,
    data: Partial<{
      baseUrl: string | null
      owner: string
      repo: string
      repoUrl: string
      lastSyncedAt: Date
    }>
  ) {
    return this.db.repositoryConnection.update({ where: { id }, data })
  }

  delete(id: string) {
    return this.db.repositoryConnection.delete({ where: { id } })
  }
}

export type RepositoryConnectionRow = NonNullable<
  Awaited<ReturnType<RepositoryConnectionRepository["findById"]>>
>
