import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { DownloadIcon, FileTextIcon } from "lucide-react"

import { Card, CardContent } from "@workspace/ui/components/card"

import { PortalUpload } from "@workspace/portal/components/portal-upload"
import { getPortalContext } from "@/lib/portal/context"
import { portalService } from "@/lib/portal"

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ""
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export default async function PortalDocumentsPage() {
  const ctx = await getPortalContext()
  if (!ctx) redirect("/onboarding")

  const [documents, t, locale] = await Promise.all([
    portalService.getDocuments(ctx),
    getTranslations("Portal"),
    getLocale(),
  ])

  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(iso)
    )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t("documentsPageTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("documentsPageDescription")}
          </p>
        </div>
        <PortalUpload />
      </div>

      <Card>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDocuments")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="flex items-center gap-2 border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <a
                      href={`/api/portal/files/${document.fileId}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {document.name}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {[
                        formatBytes(document.sizeBytes),
                        date(document.createdAt),
                        document.addedByName,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <a
                    href={`/api/portal/files/${document.fileId}/download`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                  >
                    <DownloadIcon className="size-3.5" />
                    {t("download")}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
