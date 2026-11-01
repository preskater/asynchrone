import { getTranslations } from "next-intl/server"

import { Section, SectionHeading } from "@/components/landing/section"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { faqs } from "@/lib/landing/content"

export async function FaqSection() {
  const t = await getTranslations("Marketing.faq")
  return (
    <Section id="faq">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("sectionDescription")}
      />
      <Accordion className="mx-auto mt-12 max-w-3xl">
        {faqs.map((faq, index) => {
          const key = index + 1
          return (
            <AccordionItem key={faq.value} value={faq.value}>
              <AccordionTrigger>{t(`q${key}` as never)}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t(`a${key}` as never)}
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </Section>
  )
}
