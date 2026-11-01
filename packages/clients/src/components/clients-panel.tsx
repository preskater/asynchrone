"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useClientActions } from "./actions"
import { Link, useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type { ClientData, ClientOverviewData } from "../types"
import { CLIENT_STATUSES } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { ClientDialog } from "./client-dialog"
import { CustomFieldsManagerDialog } from "./custom-fields"
import { ImportDialog } from "./import-dialog"
import { RecentActivityCard } from "./timeline"
import { downloadCsv, useClientFormat } from "./use-clients"

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  prospect: "secondary",
  inactive: "outline",
}

export function ClientsPanel({
  orgSlug,
  data,
}: {
  orgSlug: string
  data: ClientOverviewData
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const { money, day } = useClientFormat()
  const router = useRouter()
  const {
    listClientsAction,
    exportClientAction,
    archiveClientAction,
    restoreClientAction,
  } = useClientActions()

  const [query, setQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [showArchived, setShowArchived] = React.useState(false)
  const [archiveTarget, setArchiveTarget] = React.useState<ClientData | null>(
    null
  )
  const [exporting, setExporting] = React.useState(false)
  const [clients, setClients] = React.useState(data.clients)
  const [cursor, setCursor] = React.useState(data.pagination.clients)
  const [loadingMore, setLoadingMore] = React.useState(false)

  React.useEffect(() => {
    setClients(data.clients)
    setCursor(data.pagination.clients)
  }, [data])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = unwrapActionResult(await listClientsAction(cursor))
      setClients((prev) => [...prev, ...page.items])
      setCursor(page.nextCursor)
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setLoadingMore(false)
    }
  }

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return clients.filter((client) => {
      if (!showArchived && client.archivedAt) return false
      if (statusFilter !== "all" && client.status !== statusFilter) return false
      if (
        needle &&
        !`${client.name} ${client.industry ?? ""} ${client.contactEmail ?? ""}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false
      }
      return true
    })
  }, [clients, query, statusFilter, showArchived])

  const visible = filtered

  const stats = {
    total: data.stats.clients.total,
    activeClients: data.stats.clients.active,
    prospects: data.stats.clients.prospects,
    openValue: data.stats.clients.openValue,
  }

  const hasActive = clients.some((client) => !client.archivedAt)

  async function handleExport() {
    setExporting(true)
    try {
      const file = unwrapActionResult(
        await exportClientAction({ entity: "clients" })
      )
      downloadCsv(file.filename, file.content)
      toast.success(tT("exportReady"))
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setExporting(false)
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return
    try {
      unwrapActionResult(await archiveClientAction(archiveTarget.id))
      toast.success(tT("recordArchived"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setArchiveTarget(null)
    }
  }

  async function handleRestore(client: ClientData) {
    try {
      unwrapActionResult(await restoreClientAction(client.id))
      toast.success(tT("recordRestored"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  const statusItems = [
    { value: "all", label: t("common.all") },
    ...CLIENT_STATUSES.map((value) => ({
      value,
      label: L.clientStatus(value),
    })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("clients.stats.total")}
          value={String(stats.total)}
        />
        <StatCard
          label={t("clients.stats.active")}
          value={String(stats.activeClients)}
        />
        <StatCard
          label={t("clients.stats.prospects")}
          value={String(stats.prospects)}
        />
        <StatCard
          label={t("clients.stats.openValue")}
          value={money(stats.openValue)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder={t("common.search")}
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select
          items={statusItems}
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value ?? "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant={showArchived ? "default" : "outline"}
          onClick={() => setShowArchived((prev) => !prev)}
        >
          <ArchiveIcon data-icon="inline-start" />
          {t("common.showArchived")}
        </Button>
        {data.access.canManage ? (
          <CustomFieldsManagerDialog
            definitions={data.fieldDefinitions}
            trigger={
              <Button type="button" size="sm" variant="outline">
                <Settings2Icon data-icon="inline-start" />
                {t("fields.title")}
              </Button>
            }
          />
        ) : null}
        {data.access.canExport ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? (
                <Spinner className="size-4" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              {t("common.export")}
            </Button>
            <ImportDialog
              kind="clients"
              trigger={
                <Button type="button" size="sm" variant="outline">
                  <UploadIcon data-icon="inline-start" />
                  {t("common.import")}
                </Button>
              }
            />
          </>
        ) : null}
        {data.access.canEdit ? (
          <ClientDialog
            members={data.members}
            fieldDefinitions={data.fieldDefinitions}
            trigger={
              <Button type="button" size="sm">
                <PlusIcon data-icon="inline-start" />
                {t("clients.new")}
              </Button>
            }
          />
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-4">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {hasActive ? t("clients.empty") : t("clients.emptyAll")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("clients.table.name")}</TableHead>
                    <TableHead>{t("clients.table.status")}</TableHead>
                    <TableHead>{t("clients.table.industry")}</TableHead>
                    <TableHead>{t("clients.table.owner")}</TableHead>
                    <TableHead className="text-right">
                      {t("clients.table.contacts")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("clients.table.deals")}
                    </TableHead>
                    <TableHead>{t("clients.table.created")}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/${orgSlug}/clients/${client.id}`}
                            prefetch={false}
                            className="font-medium hover:underline"
                          >
                            {client.name}
                          </Link>
                          {client.archivedAt ? (
                            <Badge variant="outline">
                              {t("common.archivedBadge")}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[client.status]}>
                          {L.clientStatus(client.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {client.industry ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {client.ownerName ?? t("common.unassigned")}
                      </TableCell>
                      <TableCell className="text-right">
                        {client.contactCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {client.openDealCount > 0
                          ? `${client.openDealCount} · ${money(
                              client.openDealValue
                            )}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {day(client.createdAt.slice(0, 10))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {client.archivedAt ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={t("common.restore")}
                              onClick={() => void handleRestore(client)}
                            >
                              <ArchiveRestoreIcon className="size-4" />
                            </Button>
                          ) : (
                            <>
                              {data.access.canEdit ? (
                                <>
                                  <ClientDialog
                                    client={client}
                                    members={data.members}
                                    fieldDefinitions={data.fieldDefinitions}
                                    trigger={
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label={t("common.edit")}
                                      >
                                        <PencilIcon className="size-4" />
                                      </Button>
                                    }
                                  />
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label={t("common.archive")}
                                    onClick={() => setArchiveTarget(client)}
                                  >
                                    <ArchiveIcon className="size-4" />
                                  </Button>
                                </>
                              ) : null}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {cursor ? (
            <div className="flex justify-center pb-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? <Spinner className="size-4" /> : null}
                {t("common.loadMore")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <RecentActivityCard
        entries={data.recentActivities.map((activity) => ({
          id: activity.id,
          kind: "activity" as const,
          occurredAt: activity.occurredAt,
          activity,
        }))}
      />

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("clients.archiveTitle", { name: archiveTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.confirmArchiveDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmArchive()}>
              {t("common.archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}
