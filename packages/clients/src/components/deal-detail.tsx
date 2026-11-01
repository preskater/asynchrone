"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { useClientActions } from "./actions"
import { Link, useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type { ClientDealDetailData } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { CustomFieldValuesView } from "./custom-fields"
import { DealDialog } from "./deal-dialog"
import { DocumentsCard } from "./documents"
import { ActivityDialog, ActivityTimeline } from "./timeline"
import { useClientFormat } from "./use-clients"

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> =
  {
    open: "secondary",
    won: "default",
    lost: "destructive",
  }

export function DealDetail({
  orgSlug,
  data,
}: {
  orgSlug: string
  data: ClientDealDetailData
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const { money, day, dateTime } = useClientFormat()
  const router = useRouter()
  const {
    closeDealAction,
    reopenDealAction,
    archiveDealAction,
    restoreDealAction,
  } = useClientActions()

  const { deal, timeline } = data
  const [archiveOpen, setArchiveOpen] = React.useState(false)
  const [lossOpen, setLossOpen] = React.useState(false)
  const [lossReason, setLossReason] = React.useState("")
  const [closing, setClosing] = React.useState(false)

  async function handleWon() {
    setClosing(true)
    try {
      unwrapActionResult(
        await closeDealAction({ dealId: deal.id, status: "won" })
      )
      toast.success(tT("dealClosed"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setClosing(false)
    }
  }

  async function confirmLost() {
    setClosing(true)
    try {
      unwrapActionResult(
        await closeDealAction({
          dealId: deal.id,
          status: "lost",
          lossReason: lossReason.trim() === "" ? null : lossReason.trim(),
        })
      )
      toast.success(tT("dealClosed"))
      setLossOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setClosing(false)
    }
  }

  async function handleReopen() {
    setClosing(true)
    try {
      unwrapActionResult(await reopenDealAction(deal.id))
      toast.success(tT("dealReopened"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setClosing(false)
    }
  }

  async function confirmArchive() {
    try {
      unwrapActionResult(await archiveDealAction(deal.id))
      toast.success(tT("recordArchived"))
      setArchiveOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  async function handleRestore() {
    try {
      unwrapActionResult(await restoreDealAction(deal.id))
      toast.success(tT("recordRestored"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl">{deal.name}</CardTitle>
                  <Badge variant={STATUS_VARIANTS[deal.status]}>
                    {L.dealStatus(deal.status)}
                  </Badge>
                  {deal.stageName ? (
                    <Badge variant="outline">{deal.stageName}</Badge>
                  ) : null}
                  {deal.archivedAt ? (
                    <Badge variant="outline">{t("common.archivedBadge")}</Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {deal.clientId ? (
                    <Link
                      href={`/${orgSlug}/clients/${deal.clientId}`}
                      prefetch={false}
                      className="hover:underline"
                    >
                      {deal.clientName}
                    </Link>
                  ) : (
                    t("deals.noCompany")
                  )}{" "}
                  · {t("common.updated")} {dateTime(deal.updatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {data.access.canEdit ? (
                  <>
                    <DealDialog
                      deal={deal}
                      clients={data.clients}
                      contactOptions={data.contactOptions}
                      members={data.members}
                      pipelines={data.pipelines}
                      fieldDefinitions={data.fieldDefinitions}
                      trigger={
                        <Button type="button" size="sm" variant="outline">
                          <PencilIcon data-icon="inline-start" />
                          {t("common.edit")}
                        </Button>
                      }
                    />
                    <ActivityDialog
                      dealId={deal.id}
                      trigger={
                        <Button type="button" size="sm">
                          <PlusIcon data-icon="inline-start" />
                          {t("activity.add")}
                        </Button>
                      }
                    />
                    {deal.status === "open" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={closing}
                          onClick={() => void handleWon()}
                        >
                          <ThumbsUpIcon data-icon="inline-start" />
                          {t("deals.markWon")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={closing}
                          onClick={() => {
                            setLossReason("")
                            setLossOpen(true)
                          }}
                        >
                          <ThumbsDownIcon data-icon="inline-start" />
                          {t("deals.markLost")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={closing}
                        onClick={() => void handleReopen()}
                      >
                        {closing ? (
                          <Spinner className="size-4" />
                        ) : (
                          <RotateCcwIcon data-icon="inline-start" />
                        )}
                        {t("deals.reopen")}
                      </Button>
                    )}
                    {deal.archivedAt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRestore()}
                      >
                        <ArchiveRestoreIcon data-icon="inline-start" />
                        {t("common.restore")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setArchiveOpen(true)}
                      >
                        <ArchiveIcon data-icon="inline-start" />
                        {t("common.archive")}
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">
                  {t("deals.fields.amount")}
                </dt>
                <dd className="text-lg font-semibold">
                  {money(deal.amount, deal.currency)}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">
                  {t("deals.fields.probability")}
                </dt>
                <dd className="text-sm">
                  {deal.probability}% ·{" "}
                  {money((deal.amount * deal.probability) / 100, deal.currency)}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({t("deals.stats.weighted")})
                  </span>
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">
                  {t("deals.fields.expectedCloseDate")}
                </dt>
                <dd className="text-sm">{day(deal.expectedCloseDate)}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">
                  {t("deals.closedDate")}
                </dt>
                <dd className="text-sm">{day(deal.actualCloseDate)}</dd>
              </div>
              {deal.lossReason ? (
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">
                    {t("deals.lostReason")}
                  </dt>
                  <dd className="text-sm">{deal.lossReason}</dd>
                </div>
              ) : null}
              {deal.source ? (
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">
                    {t("deals.fields.source")}
                  </dt>
                  <dd className="text-sm">{deal.source}</dd>
                </div>
              ) : null}
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">
                  {t("deals.fields.owner")}
                </dt>
                <dd className="text-sm">
                  {deal.ownerName ?? t("common.unassigned")}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">
                  {t("common.created")}
                </dt>
                <dd className="text-sm">{day(deal.createdAt.slice(0, 10))}</dd>
              </div>
            </dl>
            {deal.description ? (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {deal.description}
              </p>
            ) : null}
            {deal.contacts.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  {t("deals.fields.contacts")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {deal.contacts.map((contact) => (
                    <Link
                      key={contact.contactId}
                      href={`/${orgSlug}/contacts/${contact.contactId}`}
                      prefetch={false}
                      className="inline-flex"
                    >
                      <Badge variant="secondary">{contact.name}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            <CustomFieldValuesView
              definitions={data.fieldDefinitions.filter(
                (def) => def.entity === "deal"
              )}
              values={deal.customFields}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("activity.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTimeline entries={timeline} limit={8} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("pipeline.stageName")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.pipelines.map((pipeline) => (
              <div key={pipeline.id} className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">
                  {pipeline.name}
                </span>
                <div className="flex flex-wrap gap-1">
                  {pipeline.stages.map((stage) => (
                    <Badge
                      key={stage.id}
                      variant={
                        stage.id === deal.stageId ? "default" : "outline"
                      }
                    >
                      {stage.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <DocumentsCard
          entity="deal"
          entityId={deal.id}
          documents={data.documents}
          canEdit={data.access.canEdit}
        />
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deals.archiveTitle", { name: deal.name })}
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

      <Dialog open={lossOpen} onOpenChange={setLossOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("deals.lostTitle", { name: deal.name })}
            </DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="client-deal-loss" className="text-sm font-medium">
              {t("deals.lostReason")}
            </label>
            <Input
              id="client-deal-loss"
              value={lossReason}
              maxLength={300}
              onChange={(event) => setLossReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLossOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={closing}
              onClick={() => void confirmLost()}
            >
              {closing ? <Spinner className="size-4" /> : null}
              {t("deals.confirmLost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
