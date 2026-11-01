import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { Building2Icon, GlobeIcon, RocketIcon, UsersIcon } from "lucide-react"

import { PageHeader } from "@/components/landing/page-header"
import { Section, SectionHeading } from "@/components/landing/section"
import { FinalCta } from "@/components/landing/final-cta"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { companyStats } from "@/lib/landing/content"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.about")
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  }
}

const statIcons = [RocketIcon, UsersIcon, GlobeIcon, Building2Icon]
const valueKeys = [
  { title: "valueClarity", description: "valueClarityDescription" },
  { title: "valueAi", description: "valueAiDescription" },
  { title: "valueWorkspace", description: "valueWorkspaceDescription" },
] as const

export default async function AboutPage() {
  const t = await getTranslations("Marketing.about")

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {companyStats.map((stat, index) => {
            const Icon = statIcons[index] ?? RocketIcon
            return (
              <Card key={stat.key}>
                <CardHeader>
                  <Icon className="size-5 text-muted-foreground" />
                  <CardTitle className="text-3xl font-semibold tabular-nums">
                    {stat.value}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {t(stat.key as never)}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <SectionHeading
          className="mt-20"
          eyebrow={t("valuesEyebrow")}
          title={t("valuesTitle")}
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {valueKeys.map((value) => (
            <Card key={value.title}>
              <CardHeader>
                <CardTitle>{t(value.title)}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t(value.description)}
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
      <FinalCta />
    </>
  )
}
