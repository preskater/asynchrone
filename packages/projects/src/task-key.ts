import type { ProjectDb } from "./db"

/**
 * Task identifiers look like `ABC-1`, `ABC-2`, …. The prefix is inherited
 * from the project's first task so renames don't change existing identifiers;
 * a fresh project derives it from the project name. Identifiers are unique per
 * organization, so numbering is shared by every project with the same prefix
 * (two projects can derive the same initials).
 * Shared by the project service and the repository sync service so tasks
 * created from remote issues get the same identifiers as local ones.
 */
export function taskPrefix(name: string, projectIdentifiers: string[]) {
  const existingPrefix = projectIdentifiers[0]?.replace(/-\d+$/, "")
  const base =
    existingPrefix ||
    name
      .replace(/[^a-zA-Z ]/g, "")
      .split(" ")
      .map((word) => word && word[0])
      .join("")
      .toUpperCase()
      .slice(0, 3)
  return base || "TSK"
}

/**
 * Hands out the next `PREFIX-n` in one atomic upsert on the per-organization
 * counter, so concurrent creates can never pick the same number. Numbers of
 * deleted tasks are not reused.
 */
export async function allocateTaskIdentifier(
  db: ProjectDb,
  organizationId: string,
  prefix: string
) {
  const [row] = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "task_identifier_counter" ("organizationId", "prefix", "value")
    VALUES (${organizationId}, ${prefix}, 1)
    ON CONFLICT ("organizationId", "prefix")
    DO UPDATE SET "value" = "task_identifier_counter"."value" + 1
    RETURNING "value"`
  return `${prefix}-${row!.value}`
}
