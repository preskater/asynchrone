import type { PrismaClient } from "@workspace/db"

/**
 * The slice of a Prisma client the projects domain needs.
 *
 * The package never opens a connection: the owning app binds its own client.
 * Today that is `apps/web` and the shared monolith client; once `apps/projects`
 * exists (#160) it binds the `asynchrone_projects` client instead.
 *
 * `member`, `user` and `account` are identity tables that the project member
 * list and the personal repository tokens still read/write directly. They move
 * behind the identity internal API when Projects becomes its own app (#190);
 * until then the structural port keeps the dependency explicit.
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
  | "account"
  | "member"
  | "user"
  | "$transaction"
  | "$queryRaw"
>
