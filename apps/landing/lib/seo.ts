import { getLocale } from "next-intl/server"

import type { Metadata } from "next"

import { routing } from "@workspace/i18n/routing"

/**
 * Public origin of the marketing site, used for canonical URLs, the sitemap
 * and the `robots.txt` host. `NEXT_PUBLIC_SITE_URL` covers preview deployments;
 * the fallbacks match `next dev` and production.
 */
function resolveSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, "")
  return process.env.NODE_ENV === "development"
    ? "http://localhost:3002"
    : "https://asynchrone.space"
}

export const siteUrl = resolveSiteUrl()

/** Static marketing pages, relative to the locale prefix. */
export const MARKETING_ROUTES = [
  "",
  "/about",
  "/blog",
  "/careers",
  "/contact",
  "/faq",
  "/features",
  "/support",
  "/legal/privacy",
  "/legal/terms",
  "/legal/security",
  "/legal/cookies",
  "/legal/dpa",
  "/legal/subprocessors",
  "/pricing",
] as const

/** Language alternates for a path relative to the locale prefix. */
export function languageAlternates(path: string) {
  return Object.fromEntries(
    routing.locales.map((locale) => [locale, `${siteUrl}/${locale}${path}`])
  )
}

/**
 * Page metadata with a canonical URL and `hreflang` alternates. The landing is
 * the indexable half of the split; Copilot and the control tower are noindex.
 */
export async function marketingMetadata({
  path,
  title,
  description,
}: {
  path: string
  title: string
  description: string
}): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: languageAlternates(path),
    },
  }
}
