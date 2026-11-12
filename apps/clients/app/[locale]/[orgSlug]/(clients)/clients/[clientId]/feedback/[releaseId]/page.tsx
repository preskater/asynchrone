import { notFound } from "next/navigation"

import { resolveClientAccess } from "@workspace/clients/access"
import { ReleaseReport } from "@workspace/clients/components/release-report"
import { isAppError } from "@workspace/core/errors"

import { clientsService } from "@/lib/clients"
import { getPageContext } from "@/lib/request-context"

export default async function ReleaseReportPage({
  params,
}: {
  params: Promise<{ orgSlug: string; clientId: string; releaseId: string }>
}) {
  const { orgSlug, clientId, releaseId } = await params
  const ctx = await getPageContext()

  let report
  try {
    report = await clientsService.getReleaseReport(ctx, releaseId)
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound()
    throw error
  }
  // The release id is enough to find it; the URL must still name its company.
  if (report.release.clientId !== clientId) notFound()

  return (
    <ReleaseReport
      orgSlug={orgSlug}
      report={report}
      canExport={resolveClientAccess(ctx).canExport}
    />
  )
}
