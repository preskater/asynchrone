import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { HeroSection } from "@/components/landing/hero-section"
import { LogoCloud } from "@/components/landing/logo-cloud"
import { FeatureGrid } from "@/components/landing/feature-grid"
import { ProductShowcase } from "@/components/landing/product-showcase"
import { Testimonials } from "@/components/landing/testimonials"
import { PricingPreview } from "@/components/landing/pricing-preview"
import { FinalCta } from "@/components/landing/final-cta"
import { marketingMetadata } from "@/lib/seo"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata")
  const metadata = await marketingMetadata({
    path: "",
    title: t("title"),
    description: t("description"),
  })
  // The home page keeps the default title instead of appending the template.
  return { ...metadata, title: { absolute: t("title") } }
}

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <LogoCloud />
      <FeatureGrid limit={3} showCta />
      <ProductShowcase />
      <Testimonials />
      <PricingPreview />
      <FinalCta />
    </>
  )
}
