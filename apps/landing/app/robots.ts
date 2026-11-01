import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/seo"

/**
 * The landing is the only indexable app in the split. List the sitemap so
 * crawlers can discover every locale, and keep the workspace hosts out of the
 * index through their own `robots.txt` and `X-Robots-Tag` headers.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
