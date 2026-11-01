import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { LegalPage } from "@/components/landing/legal-page"
import { isLegalSlug, legalSlugs } from "@/lib/landing/legal"

export function generateStaticParams() {
  return legalSlugs.map((slug) => ({ slug }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  if (!isLegalSlug(slug)) return {}
  const t = await getTranslations(`Legal.${slug}`)
  return { title: t("title"), description: t("description") }
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (!isLegalSlug(slug)) notFound()

  return <LegalPage slug={slug} />
}
