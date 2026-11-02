import type { ExportPart } from "@workspace/contracts"

/** One table in an app's export; the caller scopes every query to the org. */
export type ExportTable = () => Promise<unknown[]>

/**
 * JSON-safe conversion for Prisma rows: bigint becomes a string and Date keeps
 * its ISO representation.
 */
export function exportSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(exportSafe)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        exportSafe(item),
      ])
    )
  }
  return value
}

/**
 * Build one app's export part from its own database.
 *
 * The manifest records a row count per table; the archive writer checks it and
 * never marks the export ready when a part is missing or incomplete.
 */
export async function buildExportPart(
  app: string,
  tables: Record<string, ExportTable>,
  options: { appVersion?: string; schemaVersion?: string } = {}
): Promise<ExportPart> {
  const data: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  for (const [table, read] of Object.entries(tables)) {
    const rows = (await read()).map(exportSafe)
    data[table] = rows
    counts[table] = rows.length
  }
  return {
    manifest: {
      app,
      appVersion: options.appVersion ?? process.env.GIT_COMMIT_SHA ?? "dev",
      schemaVersion: options.schemaVersion ?? "1",
      generatedAt: new Date(),
      tables: counts,
    },
    data,
  }
}
