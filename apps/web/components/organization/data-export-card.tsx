import { getFormatter, getTranslations } from "next-intl/server"

import { RequestExportButton } from "@/components/organization/request-export-button"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getOptionalRequestContext } from "@/lib/core/auth-context"
import { formatBytes } from "@workspace/files/file-utils"
import { EXPORT_TTL_DAYS, listExports } from "@/lib/organization/export-service"

/** Owner-only: request an archive of the organization and download it. */
export async function DataExportCard() {
  const ctx = await getOptionalRequestContext()
  if (!ctx || ctx.role !== "owner") return null

  const [exports, t, format] = await Promise.all([
    listExports(ctx.organizationId),
    getTranslations("Org"),
    getFormatter(),
  ])
  const now = new Date()
  const inFlight = exports.some(
    (item) => item.status === "pending" || item.status === "processing"
  )
  const date = (value: Date) =>
    format.dateTime(value, { dateStyle: "medium", timeStyle: "short" })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exportTitle")}</CardTitle>
        <CardDescription>
          {t("exportDescription", { days: EXPORT_TTL_DAYS })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <RequestExportButton disabled={inFlight} />
        </div>
        {exports.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-md border text-sm">
            {exports.map((item) => {
              const downloadable =
                item.status === "ready" &&
                item.expiresAt !== null &&
                item.expiresAt > now
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex flex-col">
                    <span>{date(item.createdAt)}</span>
                    <span className="text-muted-foreground">
                      {downloadable
                        ? t("exportReady", {
                            size: formatBytes(Number(item.sizeBytes ?? 0)),
                            date: date(item.expiresAt!),
                          })
                        : item.status === "ready"
                          ? t("exportStatus.expired")
                          : t(`exportStatus.${item.status}` as never)}
                    </span>
                  </div>
                  {downloadable ? (
                    <a
                      href={`/api/organizations/exports/${item.id}/download`}
                      className={buttonVariants({ size: "sm" })}
                    >
                      {t("exportDownload")}
                    </a>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}
