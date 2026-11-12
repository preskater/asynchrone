"use client"

import { useTranslations } from "next-intl"
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"

import { feedbackTrend } from "../feedback-stats"
import type { ClientReleaseGroupData } from "../types"

/**
 * Whether quality improves between test rounds. Open reports carry the
 * emphasis (`--primary`, the strongest ink in both modes and per theme); fixed
 * ones are context. Values are printed on the bars because the house chart
 * tokens are grayscale and color alone cannot tell the series apart.
 */
export function FeedbackTrend({
  groups,
}: {
  groups: ClientReleaseGroupData[]
}) {
  const t = useTranslations("Clients")
  const data = feedbackTrend(groups)
  // One version is a number, not a trend.
  if (data.length < 2) return null

  const config = {
    open: { label: t("feedback.trend.open"), color: "var(--primary)" },
    fixed: { label: t("feedback.trend.fixed"), color: "var(--chart-2)" },
  } satisfies ChartConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("feedback.trend.title")}</CardTitle>
        <CardDescription>{t("feedback.trend.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-56 w-full">
          <BarChart accessibilityLayer data={data} barGap={2}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="version"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={24}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="open" fill="var(--color-open)" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="open"
                position="top"
                className="fill-foreground"
                fontSize={11}
              />
            </Bar>
            <Bar
              dataKey="fixed"
              fill="var(--color-fixed)"
              radius={[4, 4, 0, 0]}
            >
              <LabelList
                dataKey="fixed"
                position="top"
                className="fill-muted-foreground"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
