import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { PageHeader } from "@/components/landing/page-header"
import { FeatureGrid } from "@/components/landing/feature-grid"
import { ProductShowcase } from "@/components/landing/product-showcase"
import { LogoCloud } from "@/components/landing/logo-cloud"
import { FinalCta } from "@/components/landing/final-cta"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.features")
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  }
}

export default async function FeaturesPage() {
  const t = await getTranslations("Marketing.features")

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <FeatureGrid />
      <ProductShowcase />
      <LogoCloud />
      <FinalCta />
    </>
  )
}
