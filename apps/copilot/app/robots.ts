import type { MetadataRoute } from "next"

/**
 * Copilot is the signed-in workspace, not a marketing site. The landing
 * (asynchrone.space) is the only indexable app, so disallow everything here;
 * `next.config.ts` also sends `X-Robots-Tag: noindex, nofollow` on every
 * response.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  }
}
