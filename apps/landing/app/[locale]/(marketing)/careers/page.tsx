import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { MapPinIcon } from "lucide-react"

import { PageHeader } from "@/components/landing/page-header"
import { Section } from "@/components/landing/section"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"

import { jobs } from "@/lib/landing/content"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.careers")
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  }
}

export default async function CareersPage() {
  const t = await getTranslations("Marketing.careers")

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <Section>
        <div className="mx-auto max-w-3xl">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            {t("openRoles")}
          </h2>
          <div className="mt-6 flex flex-col gap-3">
            {jobs.map((job) => (
              <Card key={job.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">
                      {t(`${job.prefix}Title` as never)}
                    </span>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <Badge variant="outline">
                        {t(`${job.prefix}Team` as never)}
                      </Badge>
                      <span className="inline-flex items-center gap-1">
                        <MapPinIcon className="size-3.5" />
                        {t(`${job.prefix}Location` as never)}
                      </span>
                      <span>{t(`${job.prefix}Type` as never)}</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    {t("apply")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <Separator className="my-10" />
          <div className="flex flex-col gap-2">
            <h3 className="font-heading text-lg font-semibold">
              {t("noRoleTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("noRoleDescription")}
            </p>
          </div>
        </div>
      </Section>
    </>
  )
}
