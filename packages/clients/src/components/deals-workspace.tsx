"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  KanbanIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
import type { ClientDealData, ClientOverviewData } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { DealBoard } from "./deal-board"
import { DealDialog } from "./deal-dialog"
import { PipelineSettingsDialog } from "./pipeline-settings-dialog"
import { downloadCsv, useClientFormat } from "./use-clients"

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> =
  {
    open: "secondary",
    won: "default",
    lost: "destructive",
  }

export function DealsWorkspace({
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
    listClientDealsAction,
    moveDealAction,
    exportClientAction,
    archiveDealAction,
    restoreDealAction,
  } = useClientActions()

  const defaultPipelineId =
    data.pipelines.find((pipeline) => pipeline.isDefault)?.id ??
    data.pipelines[0]?.id ??
    ""

  const [view, setView] = React.useState<"board" | "list">("board")
  const [pipelineId, setPipelineId] = React.useState(defaultPipelineId)
  const [query, setQuery] = React.useState("")
  const [showArchived, setShowArchived] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [archiveTarget, setArchiveTarget] =
    React.useState<ClientDealData | null>(null)
  const [lossTarget, setLossTarget] = React.useState<{
    deal: ClientDealData
    stageId: string
    position: number
  } | null>(null)
  const [lossReason, setLossReason] = React.useState("")
  const [moving, setMoving] = React.useState(false)
  const [deals, setDeals] = React.useState(data.deals)
  const [cursor, setCursor] = React.useState(data.pagination.deals)
  const [loadingMore, setLoadingMore] = React.useState(false)

  React.useEffect(() => {
    setDeals(data.deals)
    setCursor(data.pagination.deals)
  }, [data])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = unwrapActionResult(await listClientDealsAction(cursor))
      setDeals((prev) => [...prev, ...page.items])
      setCursor(page.nextCursor)
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setLoadingMore(false)
    }
  }

  const pipeline =
    data.pipelines.find((item) => item.id === pipelineId) ??
    data.pipelines[0] ??
    null

  const clientOptions = data.clientOptions
  const contactOptions = data.contactOptions

  const activeDeals = React.useMemo(
    () => deals.filter((deal) => !deal.archivedAt),
    [deals]
  )

  const visibleList = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (
      showArchived ? deals : deals.filter((deal) => !deal.archivedAt)
    ).filter((deal) => {
      if (
        needle &&
        !`${deal.name} ${deal.clientName ?? ""} ${deal.stageName ?? ""}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false
      }
      return true
    })
  }, [deals, query, showArchived])

  const stats = data.stats.deals

  async function handleMove(
    deal: ClientDealData,
    stageId: string,
    position: number
  ) {
    const stage = pipeline?.stages.find((item) => item.id === stageId)
    if (!pipeline || !stage) return
    if (stage.type === "lost" && deal.status !== "lost") {
      setLossTarget({ deal, stageId, position })
      setLossReason("")
      return
    }
    setMoving(true)
    try {
      unwrapActionResult(
        await moveDealAction({ dealId: deal.id, stageId, position })
      )
      toast.success(
        stage.type !== "open" && deal.status !== stage.type
          ? tT("dealClosed")
          : tT("dealMoved")
      )
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setMoving(false)
    }
  }

  async function confirmLoss() {
    if (!lossTarget) return
    setMoving(true)
    try {
      unwrapActionResult(
        await moveDealAction({
          dealId: lossTarget.deal.id,
          stageId: lossTarget.stageId,
          position: lossTarget.position,
          lossReason: lossReason.trim() === "" ? null : lossReason.trim(),
        })
      )
      toast.success(tT("dealClosed"))
      setLossTarget(null)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setMoving(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const file = unwrapActionResult(
        await exportClientAction({ entity: "deals" })
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
      unwrapActionResult(await archiveDealAction(archiveTarget.id))
      toast.success(tT("recordArchived"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setArchiveTarget(null)
    }
  }

  async function handleRestore(deal: ClientDealData) {
    try {
      unwrapActionResult(await restoreDealAction(deal.id))
      toast.success(tT("recordRestored"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  const pipelineItems = data.pipelines.map((item) => ({
    value: item.id,
    label: item.isDefault
      ? `${item.name} · ${t("pipeline.default")}`
      : item.name,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("deals.stats.open")}
          value={money(stats.openValue)}
          hint={`${stats.openCount}`}
        />
        <StatCard
          label={t("deals.stats.weighted")}
          value={money(stats.weighted)}
          hint={t("deals.weightedHint")}
        />
        <StatCard label={t("deals.stats.won")} value={money(stats.won30)} />
        <StatCard
          label={t("deals.stats.openCount")}
          value={String(stats.openCount)}
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
        {data.pipelines.length > 1 ? (
          <Select
            items={pipelineItems}
            value={pipelineId}
            onValueChange={(value) => setPipelineId(value ?? defaultPipelineId)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {pipelineItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={view === "board" ? "default" : "ghost"}
            onClick={() => setView("board")}
          >
            <KanbanIcon data-icon="inline-start" />
            {t("deals.board")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "list" ? "default" : "ghost"}
            onClick={() => setView("list")}
          >
            <ListIcon data-icon="inline-start" />
            {t("deals.list")}
          </Button>
        </div>
        {view === "list" ? (
          <Button
            type="button"
            size="sm"
            variant={showArchived ? "default" : "outline"}
            onClick={() => setShowArchived((prev) => !prev)}
          >
            <ArchiveIcon data-icon="inline-start" />
            {t("common.showArchived")}
          </Button>
        ) : null}
        {data.access.canManage ? (
          <PipelineSettingsDialog
            pipelines={data.pipelines}
            trigger={
              <Button type="button" size="sm" variant="outline">
                <Settings2Icon data-icon="inline-start" />
                {t("deals.managePipeline")}
              </Button>
            }
          />
        ) : null}
        {data.access.canExport ? (
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
        ) : null}
        {data.access.canEdit ? (
          <DealDialog
            clients={clientOptions}
            contactOptions={contactOptions}
            members={data.members}
            pipelines={data.pipelines}
            fieldDefinitions={data.fieldDefinitions}
            trigger={
              <Button type="button" size="sm">
                <PlusIcon data-icon="inline-start" />
                {t("deals.new")}
              </Button>
            }
          />
        ) : null}
      </div>

      {view === "board" ? (
        pipeline ? (
          <DealBoard
            orgSlug={orgSlug}
            pipeline={pipeline}
            deals={activeDeals.filter(
              (deal) => deal.pipelineId === pipeline.id
            )}
            canEdit={data.access.canEdit && !moving}
            onMove={(deal, stageId, position) =>
              void handleMove(deal, stageId, position)
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("pipeline.empty")}</p>
        )
      ) : (
        <Card>
          <CardContent className="pt-4">
            {visibleList.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("deals.empty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("deals.table.name")}</TableHead>
                      <TableHead>{t("deals.table.company")}</TableHead>
                      <TableHead>{t("deals.table.stage")}</TableHead>
                      <TableHead className="text-right">
                        {t("deals.table.amount")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("deals.table.probability")}
                      </TableHead>
                      <TableHead>{t("deals.table.close")}</TableHead>
                      <TableHead>{t("deals.table.owner")}</TableHead>
                      <TableHead>{t("deals.table.status")}</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleList.map((deal) => (
                      <TableRow key={deal.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/${orgSlug}/deals/${deal.id}`}
                              prefetch={false}
                              className="font-medium hover:underline"
                            >
                              {deal.name}
                            </Link>
                            {deal.archivedAt ? (
                              <Badge variant="outline">
                                {t("common.archivedBadge")}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {deal.clientName ?? t("deals.noCompany")}
                        </TableCell>
                        <TableCell>{deal.stageName ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {money(deal.amount, deal.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {deal.probability}%
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {day(deal.expectedCloseDate)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {deal.ownerName ?? t("common.unassigned")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[deal.status]}>
                            {L.dealStatus(deal.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {deal.archivedAt ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={t("common.restore")}
                                onClick={() => void handleRestore(deal)}
                              >
                                <ArchiveRestoreIcon className="size-4" />
                              </Button>
                            ) : data.access.canEdit ? (
                              <>
                                <DealDialog
                                  deal={deal}
                                  clients={clientOptions}
                                  contactOptions={contactOptions}
                                  members={data.members}
                                  pipelines={data.pipelines}
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
                                  onClick={() => setArchiveTarget(deal)}
                                >
                                  <ArchiveIcon className="size-4" />
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {cursor ? (
        <div className="flex justify-center">
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

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deals.archiveTitle", { name: archiveTarget?.name ?? "" })}
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

      <Dialog
        open={lossTarget !== null}
        onOpenChange={(open) => {
          if (!open) setLossTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("deals.lostTitle", {
                name: lossTarget?.deal.name ?? "",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="client-loss-reason" className="text-sm font-medium">
              {t("deals.lostReason")}
            </label>
            <Input
              id="client-loss-reason"
              value={lossReason}
              maxLength={300}
              onChange={(event) => setLossReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLossTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={moving}
              onClick={() => void confirmLoss()}
            >
              {moving ? <Spinner className="size-4" /> : null}
              {t("deals.confirmLost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}
