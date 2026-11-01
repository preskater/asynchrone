import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"
import { DownloadIcon } from "lucide-react"

import { PageHeader } from "@/components/landing/page-header"
import { Section } from "@/components/landing/section"
import { ContactForm } from "@/components/forms/contact-form"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { contactChannels } from "@/lib/landing/content"
import { legalPdfPath } from "@/lib/landing/legal"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.contact")
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  }
}

const channelKeys = [
  { title: "sales", description: "salesDescription" },
  { title: "support", description: "supportDescription" },
  { title: "careers", description: "careersDescription" },
] as const

const legalPack = [
  { label: "legalPackDpa", hint: "legalPackDpaHint", slug: "dpa" },
  {
    label: "legalPackSubprocessors",
    hint: "legalPackSubprocessorsHint",
    slug: "subprocessors",
  },
  {
    label: "legalPackSecurity",
    hint: "legalPackSecurityHint",
    slug: "security",
  },
  { label: "legalPackPrivacy", hint: "legalPackPrivacyHint", slug: "privacy" },
] as const

export default async function ContactPage() {
  const t = await getTranslations("Marketing.contact")
  const locale = await getLocale()

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <Section>
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{t("cardTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactForm />
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            {contactChannels.map((channel, index) => {
              const keys = channelKeys[index]
              return (
                <Card key={channel.key}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {keys ? t(keys.title) : channel.key}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 text-sm">
                    <p className="text-muted-foreground">
                      {keys ? t(keys.description) : ""}
                    </p>
                    <span className="font-medium">{channel.detail}</span>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </Section>
      <Section className="pt-0">
        <Card>
          <CardHeader>
            <CardTitle>{t("legalPackTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("legalPackDescription")}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {legalPack.map((entry) => (
              <a
                key={entry.slug}
                href={legalPdfPath(entry.slug, locale)}
                download
                className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted/60"
              >
                <DownloadIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{t(entry.label)}</span>
                  <span className="text-sm text-muted-foreground">
                    {t(entry.hint)}
                  </span>
                </span>
              </a>
            ))}
            <p className="mt-2 px-3 text-sm text-muted-foreground">
              {t("legalPackContact")}
            </p>
          </CardContent>
        </Card>
      </Section>
    </>
  )
}
