import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { ReleaseReport } from "@workspace/clients/components/release-report"
import { NotFoundError } from "@workspace/core/errors"

import { getPortalContext } from "@/lib/portal/context"
import { portalService } from "@/lib/portal"

/** One shared test report, read-only and without internal fields (#132). */
export default async function PortalReportPage({
  params,
}: {
  params: Promise<{ releaseId: string }>
}) {
  const ctx = await getPortalContext()
  if (!ctx) redirect("/onboarding")
  const { releaseId } = await params

  let report
  try {
    report = await portalService.getReleaseReport(ctx, releaseId)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const t = await getTranslations("Portal")

  return (
    <ReleaseReport
      report={report}
      backHref="/portal/reports"
      backLabel={t("reportsBack")}
      canExport={false}
    />
  )
}
