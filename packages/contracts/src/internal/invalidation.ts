import { z } from "zod"

/**
 * Cross-app cache invalidation (issue #170, ADR 0038).
 *
 * `revalidatePath`/`revalidateTag` only affect the app that calls them. When a
 * mutation in Copilot changes a read model another app renders (portal access,
 * client records, meeting requests), Copilot fans out to every customer app
 * and asks it to revalidate the organization's paths.
 *
 * The payload is deliberately data-only: a path list and a tag list. The target
 * app revalidates its own cache, and every path is validated to stay inside the
 * organization subtree, so a caller cannot invalidate an arbitrary route.
 */
export const InvalidateSchema = z.object({
  organizationId: z.string().min(1),
  organizationSlug: z.string().min(1).max(120),
  /** Absolute paths on the target app, for example `/en/acme/clients`. */
  paths: z
    .array(
      z
        .string()
        .min(1)
        .max(500)
        .refine(
          (path) =>
            path.startsWith("/") &&
            !path.includes("..") &&
            !path.includes("//") &&
            !path.includes("?") &&
            !path.includes("#"),
          "Invalidation paths must be absolute and free of .., //, ? or #"
        )
    )
    .max(50)
    .default([]),
  /** Next.js cache tags, for reads cached with `use cache`/`unstable_cache`. */
  tags: z.array(z.string().min(1).max(200)).max(50).default([]),
  /** Human-readable reason for the audit/log line. */
  reason: z.string().max(200).optional(),
})
export type InvalidateRequest = z.infer<typeof InvalidateSchema>

export const InvalidateResponseSchema = z.object({
  app: z.string().min(1),
  revalidated: z.number().int().nonnegative(),
})
export type InvalidateResponse = z.infer<typeof InvalidateResponseSchema>
