import { getTranslations } from "next-intl/server"
import {
  CalendarIcon,
  FolderIcon,
  MessageSquareIcon,
  ShieldCheckIcon,
  UsersIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

import { Section, SectionHeading } from "@/components/landing/section"
import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { features, type Feature } from "@/lib/landing/content"

const ICONS: Record<Feature["icon"], LucideIcon> = {
  zap: ZapIcon,
  users: UsersIcon,
  calendar: CalendarIcon,
  folder: FolderIcon,
  message: MessageSquareIcon,
  shield: ShieldCheckIcon,
}

const FEATURE_KEYS: Record<Feature["icon"], string> = {
  zap: "aiWorkflows",
  users: "onePlace",
  shield: "security",
  calendar: "scheduling",
  folder: "filePermissions",
  message: "conversations",
}

export async function FeatureGrid({
  limit,
  showCta = false,
}: {
  limit?: number
  showCta?: boolean
}) {
  const t = await getTranslations("Landing.features")
  const visible = limit ? features.slice(0, limit) : features

  return (
    <Section id="features">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((feature) => {
          const Icon = ICONS[feature.icon]
          const key = FEATURE_KEYS[feature.icon]
          return (
            <Card key={feature.icon} className="h-full">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg border bg-muted/40">
                  <Icon className="size-5" />
                </div>
                <CardTitle>{t(key as never)}</CardTitle>
                <CardDescription>
                  {t(`${key}Description` as never)}
                </CardDescription>
              </CardHeader>
            </Card>
          )
        })}
      </div>
      {showCta ? (
        <div className="mt-10 flex justify-center">
          <Button
            variant="outline"
            size="lg"
            render={<Link href="/features" />}
            nativeButton={false}
          >
            {t("explore")}
          </Button>
        </div>
      ) : null}
    </Section>
  )
}
