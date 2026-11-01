"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { Section, SectionHeading } from "@/components/landing/section"
import { PricingGrid } from "@/components/landing/pricing-section"
import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

export function PricingPreview() {
  const t = useTranslations("Pricing")
  const [yearly, setYearly] = React.useState(false)

  return (
    <Section id="pricing" className="bg-muted/30">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <div className="mt-8 flex justify-center">
        <ToggleGroup
          value={[yearly ? "yearly" : "monthly"]}
          onValueChange={(value) => setYearly(value[0] === "yearly")}
          spacing={0}
          className="rounded-lg bg-muted p-1"
        >
          <ToggleGroupItem value="monthly" variant="outline" size="sm">
            {t("monthly")}
          </ToggleGroupItem>
          <ToggleGroupItem value="yearly" variant="outline" size="sm">
            {t("yearly")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="mt-10">
        <PricingGrid yearly={yearly} />
      </div>
      <div className="mt-10 flex justify-center">
        <Button
          variant="outline"
          render={<Link href="/pricing" />}
          nativeButton={false}
        >
          {t("compareAll")}
        </Button>
      </div>
    </Section>
  )
}
