import type { MetadataRoute } from "next"

import { routing } from "@workspace/i18n/routing"

import { getBlogSlugs } from "@/lib/landing/blog"
import { MARKETING_ROUTES, languageAlternates, siteUrl } from "@/lib/seo"

/**
 * Every marketing page in both locales, including MDX blog posts. Legal pages
 * and the marketing routes are static; the blog is read from `content/blog`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    ...MARKETING_ROUTES,
    ...getBlogSlugs().map((slug) => `/blog/${slug}`),
  ]

  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${siteUrl}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.7,
      alternates: { languages: languageAlternates(path) },
    }))
  )
}
