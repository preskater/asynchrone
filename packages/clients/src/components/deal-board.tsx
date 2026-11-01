"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { GripVerticalIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Link } from "@workspace/i18n/navigation"
import { cn } from "@workspace/ui/lib/utils"

import type { ClientDealData, ClientPipelineData } from "../types"

import { useClientFormat } from "./use-clients"

/**
 * Kanban board for one pipeline. Uses native HTML5 drag & drop; the parent
 * handles the move (and may ask for a loss reason before persisting).
 */
export function DealBoard({
  orgSlug,
  pipeline,
  deals,
  canEdit,
  onMove,
}: {
  orgSlug: string
  pipeline: ClientPipelineData
  deals: ClientDealData[]
  canEdit: boolean
  onMove: (deal: ClientDealData, stageId: string, position: number) => void
}) {
  const t = useTranslations("Clients")
  const { money } = useClientFormat()

  const [dragDealId, setDragDealId] = React.useState<string | null>(null)
  const [overStageId, setOverStageId] = React.useState<string | null>(null)
  const [overIndex, setOverIndex] = React.useState<number | null>(null)

  const stages = [...pipeline.stages].sort((a, b) => a.position - b.position)

  function resetDrag() {
    setDragDealId(null)
    setOverStageId(null)
    setOverIndex(null)
  }

  function handleDrop(stageId: string, columnDeals: ClientDealData[]) {
    const dealId = dragDealId
    const position = overIndex ?? columnDeals.length
    resetDrag()
    if (!dealId || !canEdit) return
    const deal = deals.find((item) => item.id === dealId)
    if (!deal) return
    const currentIndex = columnDeals.findIndex((item) => item.id === dealId)
    const target = Math.max(0, Math.min(position, columnDeals.length))
    if (deal.stageId === stageId && currentIndex === target) return
    onMove(deal, stageId, target)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((stage) => {
        const columnDeals = deals
          .filter((deal) => deal.stageId === stage.id)
          .sort((a, b) => a.position - b.position)
        const total = columnDeals.reduce((sum, deal) => sum + deal.amount, 0)
        const isOver = overStageId === stage.id
        return (
          <div
            key={stage.id}
            className={cn(
              "flex w-72 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2",
              isOver && "border-primary/60 bg-primary/5"
            )}
            onDragOver={(event) => {
              if (!canEdit) return
              event.preventDefault()
              if (overStageId !== stage.id) {
                setOverStageId(stage.id)
                setOverIndex(columnDeals.length)
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              handleDrop(stage.id, columnDeals)
            }}
          >
            <div className="flex items-center gap-2 px-1 pt-1">
              <span className="text-sm font-medium">{stage.name}</span>
              <Badge
                variant={
                  stage.type === "won"
                    ? "default"
                    : stage.type === "lost"
                      ? "destructive"
                      : "outline"
                }
              >
                {columnDeals.length}
              </Badge>
              <span className="ms-auto text-xs text-muted-foreground">
                {total > 0 ? money(total) : ""}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {columnDeals.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  {t("deals.emptyColumn")}
                </p>
              ) : (
                columnDeals.map((deal, index) => (
                  <article
                    key={deal.id}
                    draggable={canEdit}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", deal.id)
                      event.dataTransfer.effectAllowed = "move"
                      setDragDealId(deal.id)
                    }}
                    onDragEnd={resetDrag}
                    onDragOver={(event) => {
                      if (!canEdit) return
                      event.preventDefault()
                      event.stopPropagation()
                      setOverStageId(stage.id)
                      setOverIndex(index)
                    }}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-md border bg-card p-3 shadow-xs",
                      canEdit && "cursor-grab active:cursor-grabbing",
                      isOver && overIndex === index && "ring-2 ring-primary/40",
                      dragDealId === deal.id && "opacity-50"
                    )}
                  >
                    <div className="flex items-start gap-1">
                      {canEdit ? (
                        <GripVerticalIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      ) : null}
                      <Link
                        href={`/${orgSlug}/deals/${deal.id}`}
                        prefetch={false}
                        className="text-sm font-medium hover:underline"
                      >
                        {deal.name}
                      </Link>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {deal.clientName ?? t("deals.noCompany")}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {money(deal.amount, deal.currency)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {deal.probability}%
                      </span>
                      {deal.ownerName ? (
                        <span className="ms-auto text-xs text-muted-foreground">
                          {deal.ownerName}
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
              {isOver &&
              overIndex !== null &&
              overIndex >= columnDeals.length &&
              dragDealId !== null ? (
                <div className="h-1 rounded-full bg-primary/40" />
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
