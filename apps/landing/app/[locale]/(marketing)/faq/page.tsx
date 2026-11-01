import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { PageHeader } from "@/components/landing/page-header"
import { FaqSection } from "@/components/landing/faq-section"
import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.faq")
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  }
}

export default async function FaqPage() {
  const t = await getTranslations("Marketing.faq")

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      >
        <Button render={<Link href="/contact" />} nativeButton={false}>
          {t("contact")}
        </Button>
      </PageHeader>
      <FaqSection />
    </>
  )
}
