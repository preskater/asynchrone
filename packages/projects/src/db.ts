import type { PrismaClient } from "@workspace/db-projects"

/**
 * The slice of the projects database the domain needs.
 *
 * The package never opens a connection: the owning app binds its generated
 * `asynchrone_projects` client. Identity rows (`member`, `user`, `account`) are
 * not in this database — the service reads and writes them through the
 * `MemberDirectoryPort` and the repository integration's account-token port.
 */
export type ProjectDb = Pick<
  PrismaClient,
  | "project"
  | "projectMember"
  | "projectLabel"
  | "label"
  | "task"
  | "taskLabel"
  | "subtask"
  | "taskComment"
  | "projectActivity"
  | "taskTemplate"
  | "projectMessage"
  | "repositoryConnection"
  | "userRepositoryToken"
  | "$transaction"
  | "$queryRaw"
>
