import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { PageHeader } from "@/components/landing/page-header"
import { PricingSection } from "@/components/landing/pricing-section"
import { FaqSection } from "@/components/landing/faq-section"
import { FinalCta } from "@/components/landing/final-cta"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.pricing")
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  }
}

export default async function PricingPage() {
  const t = await getTranslations("Marketing.pricing")

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </>
  )
}
